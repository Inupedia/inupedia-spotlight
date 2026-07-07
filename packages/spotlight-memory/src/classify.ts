import type { SpotlightMemoryEntryKind } from "@inupedia/spotlight-protocol";

const REALTIME_PATTERN =
  /(今天|今日|现在|当前|最新|实时|刚才|刚刚|this moment|right now|today)/i;

const DATA_PATTERN =
  /(多少|几米|几个|统计|数据|进度|掘进|完成率|清单|列表|有哪些|有多少)/;

const ACTION_PATTERN =
  /(打开|开启|进入|切换到|显示|启动|开始|暂停|停止|继续)/;

export interface ClassifyMemoryKindInput {
  question: string;
  hasToolPlan: boolean;
  hasTextAnswer: boolean;
  usedDataTools: boolean;
}

export interface ClassifyMemoryKindResult {
  kind: SpotlightMemoryEntryKind | null;
  blockedReason?: "realtime_data" | "no_durable_output";
}

/** Decide whether and how to cache a completed turn. */
export function classifyMemoryKind(
  input: ClassifyMemoryKindInput,
): ClassifyMemoryKindResult {
  const q = input.question.trim();
  if (!q) return { kind: null, blockedReason: "no_durable_output" };

  if (input.hasToolPlan && !input.hasTextAnswer) {
    return { kind: "action_plan" };
  }

  if (input.usedDataTools || DATA_PATTERN.test(q)) {
    if (REALTIME_PATTERN.test(q)) {
      return { kind: null, blockedReason: "realtime_data" };
    }
    if (input.hasTextAnswer) {
      return { kind: "data_snapshot" };
    }
  }

  if (input.hasTextAnswer && !ACTION_PATTERN.test(q)) {
    return { kind: "qa_answer" };
  }

  if (input.hasToolPlan) {
    return { kind: "action_plan" };
  }

  return { kind: null, blockedReason: "no_durable_output" };
}

export function isMemoryKindAllowedForRead(
  kind: SpotlightMemoryEntryKind,
): boolean {
  return kind !== "routing_hint";
}
