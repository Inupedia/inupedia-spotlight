import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  FrontendToolDescriptorV1,
  SpotlightSkill,
} from "@inupedia/spotlight-protocol";
import { z } from "zod";

const skillRouteSchema = z.object({
  route: z.enum(["knowledge", "action", "clarify"]),
  matchedSkillNames: z.array(z.string()).default([]),
  requestedToolNames: z.array(z.string()).default([]),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export type SkillRouteResult = z.infer<typeof skillRouteSchema>;

const LIST_QUERY_PATTERN =
  /(?:有哪些|多少|几路|清单|列表|数量|在线状态|覆盖哪些|有几个)/u;
const OPEN_TARGET_VERB_PATTERN = /(?:看看|查看|打开|显示|播放)/u;

function toolsForSkill(
  skill: SpotlightSkill,
  clientTools: FrontendToolDescriptorV1[],
): FrontendToolDescriptorV1[] {
  const allowed = new Set(skill.allowedTools ?? []);
  return clientTools.filter((tool) => allowed.has(tool.name));
}

function inferReadOnlyTool(
  skills: SpotlightSkill[],
  clientTools: FrontendToolDescriptorV1[],
): string | null {
  const readOnly = new Set(
    clientTools
      .filter((tool) => tool.sideEffect === "none")
      .map((tool) => tool.name),
  );
  for (const skill of skills) {
    const candidates = (skill.allowedTools ?? []).filter((name) =>
      readOnly.has(name),
    );
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

export function isSkillListQuery(question: string): boolean {
  return LIST_QUERY_PATTERN.test(question);
}

export function hasOpenTargetIntent(question: string): boolean {
  return (
    OPEN_TARGET_VERB_PATTERN.test(question) && !isSkillListQuery(question)
  );
}

export function extractOpenTargetName(question: string): string | undefined {
  const normalized = question
    .trim()
    .replace(/^(请|帮我|给我)?/u, "")
    .replace(/^(看看|查看|打开|显示|播放)/u, "")
    .replace(/(的)?(BIM|bim)?(模型|三维|建筑物?)?$/u, "")
    .trim();
  return normalized || undefined;
}

export function extractMonitorTargetName(question: string): string | undefined {
  const normalized = question
    .trim()
    .replace(/^(请|帮我|给我)?/u, "")
    .replace(/^(看看|查看|打开|显示|播放)/u, "")
    .trim();
  return normalized || undefined;
}

function registeredToolMap(clientTools: FrontendToolDescriptorV1[]) {
  return new Map(clientTools.map((tool) => [tool.name, tool]));
}

export function enrichSkillToolRoute(
  question: string,
  route: SkillRouteResult,
  skills: SpotlightSkill[],
  clientTools: FrontendToolDescriptorV1[],
): SkillRouteResult {
  if (route.route !== "action") return route;
  const registered = registeredToolMap(clientTools);
  const matched = skills.filter((skill) =>
    route.matchedSkillNames.includes(skill.name),
  );
  if (matched.length === 0) return route;

  const openIntent = hasOpenTargetIntent(question);
  const listIntent = isSkillListQuery(question);

  if (route.matchedSkillNames.includes("skill.monitoring")) {
    const playTool = "playVideoFullscreen";
    if (openIntent && registered.has(playTool)) {
      const name = extractMonitorTargetName(question);
      return {
        ...route,
        requestedToolNames: [playTool],
        toolInput: name ? { name } : route.toolInput,
        reason: `${route.reason} Monitoring open intent → ${playTool}.`,
      };
    }
    if (listIntent && registered.has("getVideoInfo")) {
      return {
        ...route,
        requestedToolNames: ["getVideoInfo"],
        toolInput: {},
        reason: `${route.reason} Monitoring list intent → getVideoInfo.`,
      };
    }
  }

  if (route.matchedSkillNames.includes("skill.bim")) {
    const openTool = "openBimBuilding";
    if (openIntent && registered.has(openTool)) {
      const target = extractOpenTargetName(question);
      if (target) {
        return {
          ...route,
          requestedToolNames: [openTool],
          toolInput: { target },
          reason: `${route.reason} BIM open intent → ${openTool}.`,
        };
      }
    }
    if (
      (listIntent || (!openIntent && route.requestedToolNames.length === 0)) &&
      registered.has("getBimModelInfo")
    ) {
      return {
        ...route,
        requestedToolNames: ["getBimModelInfo"],
        toolInput: {},
        reason: `${route.reason} BIM list intent → getBimModelInfo.`,
      };
    }
  }

  const selected = route.requestedToolNames[0];
  if (
    selected === "getVideoInfo" &&
    openIntent &&
    route.matchedSkillNames.includes("skill.monitoring") &&
    registered.has("playVideoFullscreen")
  ) {
    const name = extractMonitorTargetName(question);
    return {
      ...route,
      requestedToolNames: ["playVideoFullscreen"],
      toolInput: name ? { name } : route.toolInput,
      reason: "Corrected monitoring list tool to play tool for a named target.",
    };
  }

  if (
    selected === "getBimModelInfo" &&
    openIntent &&
    route.matchedSkillNames.includes("skill.bim") &&
    registered.has("openBimBuilding")
  ) {
    const target = extractOpenTargetName(question);
    if (target) {
      return {
        ...route,
        requestedToolNames: ["openBimBuilding"],
        toolInput: { target },
        reason: "Corrected BIM list tool to open tool for a named building.",
      };
    }
  }

  return route;
}

function validateSkillRoute(
  question: string,
  raw: SkillRouteResult,
  skills: SpotlightSkill[],
  clientTools: FrontendToolDescriptorV1[],
): SkillRouteResult | null {
  const skillByName = new Map(skills.map((skill) => [skill.name, skill]));
  const matchedSkills = raw.matchedSkillNames
    .map((name) => skillByName.get(name))
    .filter((skill): skill is SpotlightSkill => Boolean(skill));
  if (matchedSkills.length === 0) return null;

  const allowedToolNames = new Set(
    matchedSkills.flatMap((skill) => skill.allowedTools ?? []),
  );
  const registeredTools = registeredToolMap(clientTools);
  let requestedToolNames = raw.requestedToolNames.filter(
    (name) => allowedToolNames.has(name) && registeredTools.has(name),
  );
  if (
    raw.route === "action" &&
    requestedToolNames.length === 0 &&
    matchedSkills.length === 1 &&
    isSkillListQuery(question)
  ) {
    const inferred = inferReadOnlyTool(matchedSkills, clientTools);
    if (inferred) requestedToolNames = [inferred];
  }

  return enrichSkillToolRoute(
    question,
    {
      ...raw,
      matchedSkillNames: matchedSkills.map((skill) => skill.name),
      requestedToolNames,
    },
    skills,
    clientTools,
  );
}

export function buildSkillCatalog(
  skills: SpotlightSkill[],
  clientTools: FrontendToolDescriptorV1[],
) {
  const registeredTools = registeredToolMap(clientTools);
  return skills.map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    whenToUse: skill.whenToUse,
    responseStrategy: skill.responseStrategy,
    allowedTools: (skill.allowedTools ?? [])
      .filter((name) => registeredTools.has(name))
      .map((name) => {
        const tool = registeredTools.get(name)!;
        return {
          name,
          description: tool.description,
          sideEffect: tool.sideEffect,
        };
      }),
    capabilityExamples: skill.capabilityExamples?.slice(0, 6),
    toolExamples: skill.toolExamples?.slice(0, 6),
  }));
}

export async function routeViaSkillCatalog(
  model: BaseChatModel,
  question: string,
  clientTools: FrontendToolDescriptorV1[],
  skills: SpotlightSkill[],
): Promise<SkillRouteResult | null> {
  if (skills.length === 0) return null;
  const structured = model.withStructuredOutput(skillRouteSchema, {
    name: "spotlight_skill_route",
  });
  const raw = skillRouteSchema.parse(
    await structured.invoke([
      new SystemMessage(
        [
          "You are Spotlight's skill-first router aligned with LangChain Agent Skills.",
          "Match the latest user message to consumer Skills using semantic understanding of description and whenToUse.",
          "Do not rely on exact phrase matching against capability examples; treat examples as hints only.",
          "",
          "Lane rules:",
          "- knowledge: skill.knowledge and direct_answer skills about project facts, introductions, explanations, or public information without manipulating the live page.",
          "- action: tool_answer skills that read live page data (lists, counts, status) or perform UI operations via registered client tools.",
          "- clarify: an action skill matches but the target, channel, or required parameter is missing.",
          "",
          "Tool selection hints:",
          "- List/count/status (有哪些/多少/清单) → read-only tool for that skill.",
          "- 看看/查看/打开 + specific target → open/play tool with extracted target/name.",
          "- “看看泸定取水口” → skill.bim, openBimBuilding, target=泸定取水口",
          "- “目前有哪些监控” → skill.monitoring, getVideoInfo",
          "- “查看昂州河河道水位监测” → skill.monitoring, playVideoFullscreen",
          "",
          "requestedToolNames must contain only exact names from the matched skill's allowedTools.",
          "matchedSkillNames must come from the provided catalog. Return an empty array when no skill fits.",
        ].join("\n"),
      ),
      new HumanMessage(
        JSON.stringify({
          latestUserMessage: question,
          skills: buildSkillCatalog(skills, clientTools),
        }),
      ),
    ]),
  );
  return validateSkillRoute(question, raw, skills, clientTools);
}

export function toolsForMatchedSkills(
  skills: SpotlightSkill[],
  clientTools: FrontendToolDescriptorV1[],
  matchedSkillNames: string[],
): FrontendToolDescriptorV1[] {
  const matched = new Set(matchedSkillNames);
  const allowed = new Set(
    skills
      .filter((skill) => matched.has(skill.name))
      .flatMap((skill) => skill.allowedTools ?? []),
  );
  return clientTools.filter((tool) => allowed.has(tool.name));
}

export function candidateToolsForSkillRoute(
  skills: SpotlightSkill[],
  clientTools: FrontendToolDescriptorV1[],
  route: SkillRouteResult,
): FrontendToolDescriptorV1[] {
  const matchedSkills = skills.filter((skill) =>
    route.matchedSkillNames.includes(skill.name),
  );
  if (matchedSkills.length === 0) return [];
  if (matchedSkills.length === 1) {
    return toolsForSkill(matchedSkills[0], clientTools);
  }
  return toolsForMatchedSkills(skills, clientTools, route.matchedSkillNames);
}
