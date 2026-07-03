import { getLlmTimeoutMs, parseJsonContent } from "./llmUtils.js";
import { postSpotlightJson } from "../../remote/serverJson.js";

export interface Live2dBriefingSentence {
  text: string;
  pauseMs?: number;
}

export interface Live2dBriefingPlan {
  title?: string;
  sentences: Live2dBriefingSentence[];
}

type Live2dBriefingSchema = {
  title?: string;
  sentences?: Array<{
    text?: string;
    pauseMs?: number;
  }>;
};

const SYSTEM_PROMPT = [
  "你是工程项目数字人汇报压缩器。",
  "你的任务：把输入内容压缩成适合口播汇报的短句。",
  "输出必须是 JSON，且严格匹配 schema，不要输出任何额外文本。",
  "约束：",
  "1) 句子通俗、口语化，避免工具名、链路细节、markdown 标记。",
  "2) 优先保留：结论、关键数字、风险提醒、下一步建议。",
  "3) 每句长度建议 16~36 字，最多 8 句。",
  "4) 如果信息不足，给出保守说明，不要编造。",
].join("\n");

function resolveMaxSentences(): number {
  const raw = Number(import.meta.env.VITE_LIVE2D_BRIEFING_MAX_SENTENCES ?? 5);
  if (!Number.isFinite(raw)) return 5;
  return Math.min(8, Math.max(1, Math.round(raw)));
}

function normalizeSentence(
  sentence: Live2dBriefingSentence,
): Live2dBriefingSentence | null {
  const text = sentence.text
    .replace(/\s+/g, " ")
    .replace(/[。！？；,.，]+$/g, "")
    .trim();
  if (!text) return null;
  return {
    text: `${text}。`,
    pauseMs:
      typeof sentence.pauseMs === "number"
        ? Math.min(1200, Math.max(0, Math.round(sentence.pauseMs)))
        : 260,
  };
}

function fallbackSplitSentences(content: string): Live2dBriefingPlan {
  const maxSentences = resolveMaxSentences();
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#>*_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const chunks = plain
    .split(/[。！？；]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxSentences);

  const sentences = (chunks.length ? chunks : [plain.slice(0, 48)])
    .map((text) => normalizeSentence({ text, pauseMs: 260 }))
    .filter((item): item is Live2dBriefingSentence => Boolean(item));

  return { title: "本轮汇报", sentences };
}

export function buildFastLive2dBriefing(
  rawContent: string,
): Live2dBriefingPlan {
  return fallbackSplitSentences(rawContent);
}

function toPlan(data: Live2dBriefingSchema): Live2dBriefingPlan {
  const maxSentences = resolveMaxSentences();
  const sentences = (data.sentences ?? [])
    .map((item) =>
      normalizeSentence({
        text: item.text ?? "",
        pauseMs: item.pauseMs ?? 260,
      }),
    )
    .filter((item): item is Live2dBriefingSentence => Boolean(item))
    .slice(0, maxSentences);

  if (!sentences.length) {
    throw new Error("live2d briefing has empty sentences");
  }

  return {
    title: data.title?.trim() || "本轮汇报",
    sentences,
  };
}

async function requestBriefingLlm(
  userPrompt: string,
  maxSentences: number,
  signal?: AbortSignal,
): Promise<string> {
  const { content } = await postSpotlightJson<{ content: string }>(
    "/v1/llm/chat",
    {
      systemPrompt: [
        SYSTEM_PROMPT,
        `5) 最多输出 ${maxSentences} 句。`,
        "输出格式示例：",
        '{"title":"本轮汇报","sentences":[{"text":"...","pauseMs":260}]}',
        "禁止输出 markdown 代码块。",
      ].join("\n"),
      userPrompt,
      maxTokens: 700,
      timeoutMs: Math.max(getLlmTimeoutMs(), 45_000),
    },
    signal,
  );
  return content;
}

export async function summarizeLive2dBriefing(
  rawContent: string,
  signal?: AbortSignal,
): Promise<Live2dBriefingPlan> {
  const input = rawContent.trim();
  if (!input) {
    return { title: "本轮汇报", sentences: [] };
  }

  try {
    const maxSentences = resolveMaxSentences();
    const compactInput = input.slice(0, 4000);
    const content = await requestBriefingLlm(
      `请将以下内容压缩为数字人汇报短句：\n\n${compactInput}`,
      maxSentences,
      signal,
    );
    const parsed = parseJsonContent<Live2dBriefingSchema>(content);
    return toPlan({
      title: parsed.title,
      sentences: Array.isArray(parsed.sentences)
        ? parsed.sentences.map((item) => ({
            text: item.text ?? "",
            pauseMs: item.pauseMs,
          }))
        : [],
    });
  } catch {
    return fallbackSplitSentences(input);
  }
}
