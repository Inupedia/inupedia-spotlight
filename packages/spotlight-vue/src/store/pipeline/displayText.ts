const LOOP_ACTION_LABELS: Record<string, string> = {
  call_tools: "调用工具",
  respond: "生成回答",
  fallback: "兜底回复",
};

const LEGACY_TOOL_STEP_ID = "3";
const GATHER_STEP_ID = "gather";
const ACT_STEP_ID = "act";
const ANSWER_STEP_ID = "answer";

const LOOP_PLANNING_LINE = /^第 \d+ 轮：/u;
const LOOP_PLANNING_BLOCK =
  /(?:\n\n+)?第 \d+ 轮：[\s\S]*?(?=\n\n第 \d+ 轮：|$)/gu;

/** 规划区与面向用户的回答区之间的稳定分隔（与 spotlight-server toolStepContent 对齐）。 */
export const TOOL_STEP_ANSWER_DELIMITER = "\n\n--- spotlight-answer ---\n\n";

/** 将步骤正文里的英文 loop 动作名替换为中文（兼容旧 run 或遗漏路径）。 */
export function humanizeSpotlightStepContent(content: string): string {
  if (!content.trim()) return content;
  let text = content;
  for (const [key, label] of Object.entries(LOOP_ACTION_LABELS)) {
    text = text.replace(new RegExp(`\\b${key}\\b`, "g"), label);
  }
  return text;
}

const TOOL_STEP_INTERNAL_BLOCK =
  /(?:\n\n+|^)(【(?:Skill 已(?:加|预加)载|会话 Skill 已恢复)】[\s\S]*?)(?=\n\n(?:第 \d+ 轮：|【(?:Skill 已(?:加|预加)载|会话 Skill 已恢复)】)|$)/gu;

const TOOL_STEP_INTERNAL_MARKER =
  /【(?:Skill 已(?:加|预加)载|会话 Skill 已恢复)】/u;

function splitLegacyToolStepContent(normalized: string): {
  planning: string;
  answer: string;
} {
  const roundBlocks = [
    ...normalized.matchAll(/(?:^|\n\n)(第 \d+ 轮：[^\n]+\n原因：[^\n]+)/gu),
  ]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  const skillBlocks = [...normalized.matchAll(TOOL_STEP_INTERNAL_BLOCK)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  if (roundBlocks.length === 0 && skillBlocks.length === 0) {
    return { planning: "", answer: normalized };
  }

  let answer = normalized;
  for (const block of [...roundBlocks, ...skillBlocks]) {
    answer = answer.replace(block, "");
  }
  answer = answer.replace(/\n{3,}/g, "\n\n").trim();

  const planning = [...roundBlocks, ...skillBlocks].join("\n\n").trim();
  return { planning, answer };
}

/** 从「执行工具与回答」步骤正文中拆出多轮规划说明与面向用户的最终回答。 */
export function splitToolStepContent(content: string): {
  planning: string;
  answer: string;
} {
  const normalized = humanizeSpotlightStepContent(content).trim();
  if (!normalized) return { planning: "", answer: "" };

  const delimiterIndex = normalized.indexOf(TOOL_STEP_ANSWER_DELIMITER);
  if (delimiterIndex >= 0) {
    return {
      planning: normalized.slice(0, delimiterIndex).trim(),
      answer: normalized
        .slice(delimiterIndex + TOOL_STEP_ANSWER_DELIMITER.length)
        .trim(),
    };
  }

  return splitLegacyToolStepContent(normalized);
}

export function composeToolStepContent(
  planning: string,
  answer: string,
): string {
  const plan = planning.trim();
  const body = answer.trim();
  if (plan && body) {
    return `${plan}${TOOL_STEP_ANSWER_DELIMITER}${body}`;
  }
  return plan || body;
}

/**
 * 面向用户回答区的最后一道净化线。
 * 工具执行 step 的正文会混入规划、skill 注入提示或旧服务端的工具 chunk；
 * 最终回答和流式回答都必须经过这里，避免中途把内部材料渲染给用户。
 */
export function sanitizeToolStepAnswerText(content: string): string {
  const normalized = humanizeSpotlightStepContent(content).trim();
  if (!normalized) return "";

  const { planning, answer } = splitToolStepContent(normalized);
  if (planning.trim() && !normalized.includes(TOOL_STEP_ANSWER_DELIMITER)) {
    return "";
  }
  const candidate = (answer || (planning.trim() ? "" : normalized)).trim();
  if (!candidate || TOOL_STEP_INTERNAL_MARKER.test(candidate)) return "";

  return stripLoopPlanningBlocks(candidate)
    .replace(TOOL_STEP_INTERNAL_BLOCK, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip vendor evidence labels from displayed text.
 * Never wipe the whole answer just because a label appears inside it.
 */
export function stripInternalEvidenceAnswer(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/^联网检索证据：\s*/u, "")
    .split(/\n/u)
    .map((line) =>
      line.replace(
        /(?:^[-*]\s*)?(?:Tavily answer|Hikari answer|Yuxi project knowledge|Spotlight knowledge)\s*[：:]\s*/giu,
        "",
      ),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface GatherProcessDisplay {
  headline: string;
  items: string[];
  note: string;
}

const ORGANIZING_NOTE = "正在依据资料组织回答。";
const NUMBERED_ITEM = /^\s*\d+[.、]\s+(.+)$/u;
const HIT_HEAD = /^(.*?命中\s+\d+\s+条资料)/u;

/**
 * Turn a gather/search summary into a headline + numbered sources.
 * Accepts both the new multiline `1. 2. 3.` form and the old `A；B；C` dump.
 */
export function parseGatherProcessDisplay(
  content: string,
): GatherProcessDisplay | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  let note = "";
  let body = trimmed;
  if (body.includes(ORGANIZING_NOTE)) {
    note = ORGANIZING_NOTE;
    body = body.replace(ORGANIZING_NOTE, "").trim();
  }

  const numbered = body
    .split(/\n/u)
    .map((line) => line.match(NUMBERED_ITEM)?.[1]?.trim() ?? "")
    .filter(Boolean);
  if (numbered.length > 0) {
    const headline =
      body
        .split(/\n/u)
        .map((line) => line.trim())
        .find((line) => line && !NUMBERED_ITEM.test(line))
        ?.replace(/[：:]\s*$/u, "") ?? "";
    return { headline, items: numbered, note };
  }

  const hit = body.match(HIT_HEAD);
  if (hit) {
    const headline = hit[1]!.trim();
    const rest = body.slice(hit[0].length).replace(/^[：:]\s*/u, "").trim();
    const titles = rest
      .replace(/[。．.]\s*$/u, "")
      .split(/[；;]\s*/u)
      .map((title) => title.trim())
      .filter(Boolean);
    return { headline, items: titles, note };
  }

  return { headline: body, items: [], note };
}

export function formatGatherProcessText(content: string): string {
  const parsed = parseGatherProcessDisplay(content);
  if (!parsed) return "";
  const parts = [parsed.headline];
  if (parsed.items.length > 0) {
    parts.push(parsed.items.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  }
  if (parsed.note) parts.push(parsed.note);
  return parts.filter(Boolean).join("\n");
}

export function isToolExecutionStep(stepId: string): boolean {
  return (
    stepId === GATHER_STEP_ID ||
    stepId === ACT_STEP_ID ||
    stepId === LEGACY_TOOL_STEP_ID
  );
}

export function isAnswerStep(stepId: string): boolean {
  return stepId === ANSWER_STEP_ID;
}

/** 判断是否为 query loop 写入的规划摘要块（「第 N 轮：…」）。 */
export function isLoopPlanningChunk(chunk: string): boolean {
  return LOOP_PLANNING_LINE.test(
    humanizeSpotlightStepContent(chunk).trimStart(),
  );
}

/**
 * 从「分析意图」步骤正文中剥离误写入的 loop 规划摘要。
 * 旧服务端会把「第 N 轮：调用工具」直接 append 到 intent 步骤末尾。
 */
export function splitIntentStepContent(content: string): {
  intent: string;
  misplacedPlanning: string;
} {
  const normalized = humanizeSpotlightStepContent(content).trim();
  if (!normalized) return { intent: "", misplacedPlanning: "" };

  const splitAt = normalized.search(/\n\n第 \d+ 轮：/u);
  if (splitAt >= 0) {
    return {
      intent: normalized.slice(0, splitAt).trim(),
      misplacedPlanning: normalized.slice(splitAt).trim(),
    };
  }

  if (LOOP_PLANNING_LINE.test(normalized)) {
    return { intent: "", misplacedPlanning: normalized };
  }

  return { intent: normalized, misplacedPlanning: "" };
}

/** 「分析意图」步骤面向用户的展示文案（不含 loop 规划摘要）。 */
export function getIntentStepDisplayContent(content: string): string {
  return splitIntentStepContent(content).intent;
}

/** 移除正文中所有 loop 规划块（用于兜底清理）。 */
export function stripLoopPlanningBlocks(content: string): string {
  const normalized = humanizeSpotlightStepContent(content).trim();
  if (!normalized) return "";
  return normalized.replace(LOOP_PLANNING_BLOCK, "").trim();
}
