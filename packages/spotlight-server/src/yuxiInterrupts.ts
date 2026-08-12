export const YUXI_TOOL_APPROVAL_MODE = "always_trust";
export const YUXI_MAX_INTERRUPT_RESUMES = 4;

export type YuxiInterruptKind = "ask_user_question" | "human_approval";

export interface YuxiInterrupt {
  kind: YuxiInterruptKind;
  questions: Array<Record<string, unknown>>;
  actionRequests: unknown[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asQuestionList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
}

export function parseYuxiInterrupt(
  eventType: string,
  envelope: Record<string, unknown>,
): YuxiInterrupt | null {
  const payload = asRecord(envelope.payload) ?? envelope;
  const chunk = asRecord(payload.chunk) ?? payload;
  const approval = asRecord(chunk.approval) ?? asRecord(payload.approval);
  const questions = asQuestionList(chunk.questions ?? payload.questions);
  const actionRequests = Array.isArray(approval?.action_requests)
    ? approval.action_requests
    : Array.isArray(chunk.action_requests)
      ? chunk.action_requests
      : [];
  const reason = String(
    payload.reason ?? chunk.status ?? payload.status ?? "",
  ).toLowerCase();

  if (
    reason.includes("human_approval") ||
    reason.includes("tool_approval") ||
    actionRequests.length > 0
  ) {
    return { kind: "human_approval", questions, actionRequests };
  }

  if (
    reason.includes("ask_user") ||
    questions.length > 0 ||
    eventType === "interrupt"
  ) {
    return { kind: "ask_user_question", questions, actionRequests };
  }

  return null;
}

export function isYuxiInterruptStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized === "interrupted" ||
    normalized.includes("ask_user") ||
    normalized.includes("human_approval")
  );
}

function optionValue(option: unknown): unknown {
  if (!option || typeof option !== "object" || Array.isArray(option)) return option;
  const record = option as Record<string, unknown>;
  return record.value ?? record.label ?? option;
}

export function buildYuxiResumeInput(
  interrupt: YuxiInterrupt,
): Record<string, unknown> {
  if (interrupt.kind === "human_approval") {
    const count = Math.max(1, interrupt.actionRequests.length);
    return {
      decisions: Array.from({ length: count }, () => ({ type: "approve" })),
    };
  }

  const answers: Record<string, unknown> = {};
  for (const question of interrupt.questions) {
    const id = String(question.question_id ?? question.id ?? "").trim();
    if (!id) continue;
    const options = Array.isArray(question.options) ? question.options : [];
    const recommended = options.find((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      return String((item as { label?: unknown }).label ?? "")
        .toLowerCase()
        .includes("recommended");
    });
    const value =
      optionValue(recommended) ??
      optionValue(options[0]) ??
      "请直接根据知识库检索并回答，无需再向用户确认。";
    answers[id] = question.multi_select ? [value] : value;
  }
  if (!Object.keys(answers).length) {
    answers.spotlight = "请直接根据知识库检索并回答，无需再向用户确认。";
  }
  return answers;
}
