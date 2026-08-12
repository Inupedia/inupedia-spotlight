import type {
  CreateRunRequest,
  FrontendToolDescriptorV1,
} from "@inupedia/spotlight-protocol";
import type { IntentDecision } from "./contracts.js";

const INFORMATION_PATTERNS = [
  /(?:介绍|说明|讲讲|了解|什么是|是什么|资料|概况|情况|知识|为什么|如何理解)/u,
  /(?:查询|哪些|多少|几个|几路|几人|几台|状态|数据|统计|清单|列表|进度|完成率)/u,
  /(?:introduce|explain|what is|tell me about|overview)/iu,
];

const ACTION_PATTERNS = [
  /(?:打开|关闭|播放|暂停|跳转|进入|退出|返回|开始|停止|继续|恢复|开启|切换|定位|显示|隐藏|查看|巡检)/u,
  /(?:open|close|play|pause|navigate|enter|exit|return|start|stop|resume|enable|switch|show|hide|view)/iu,
];

const MEMORY_CONTROL_PATTERNS = [
  /(?:记住|记得|忘记|别再记|删除.*记忆)/u,
  /(?:remember|forget|delete.*memory)/iu,
];

export function hasInformationEvidence(question: string): boolean {
  return INFORMATION_PATTERNS.some((pattern) => pattern.test(question));
}

export function extractActionEvidence(question: string): string | null {
  for (const pattern of ACTION_PATTERNS) {
    const match = question.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

export function hasMemoryControlEvidence(question: string): boolean {
  return MEMORY_CONTROL_PATTERNS.some((pattern) => pattern.test(question));
}

export function isMemoryReadEnabled(request: CreateRunRequest): boolean {
  if (request.memoryRefreshRequested === true) return false;
  const session = request.sessionState as
    | (CreateRunRequest["sessionState"] & { memoryReadEnabled?: unknown })
    | undefined;
  if (!session) return true;
  if (typeof session.memoryEnabled === "boolean") return session.memoryEnabled;
  if (typeof session.memoryReadEnabled === "boolean") {
    return session.memoryReadEnabled;
  }
  return true;
}

export function memoryControlMode(
  question: string,
): "remember" | "forget" | null {
  if (/(?:忘记|别再记|删除.*记忆|forget|delete.*memory)/iu.test(question))
    return "forget";
  if (/(?:记住|记得|remember)/iu.test(question)) return "remember";
  return null;
}

export function applyIntentSafetyFence(
  question: string,
  decision: IntentDecision,
): IntentDecision {
  const actionEvidence = extractActionEvidence(question);
  if (hasMemoryControlEvidence(question)) {
    return {
      route: "knowledge",
      confidence: 1,
      reason: "The latest user message explicitly controls personal memory.",
      requestedToolNames: [],
      explicitActionEvidence: null,
    };
  }
  if (hasInformationEvidence(question) && !actionEvidence) {
    return {
      route: "knowledge",
      confidence: Math.max(decision.confidence, 0.99),
      reason:
        "The user explicitly requested information and supplied no action verb.",
      requestedToolNames: [],
      explicitActionEvidence: null,
    };
  }
  if (
    decision.route === "action" &&
    (!actionEvidence || decision.confidence < 0.9)
  ) {
    return {
      route: "clarify",
      confidence: decision.confidence,
      reason: actionEvidence
        ? "Action confidence is below the execution threshold."
        : "No explicit action evidence was found in the latest user message.",
      requestedToolNames: [],
      explicitActionEvidence: actionEvidence,
    };
  }
  return { ...decision, explicitActionEvidence: actionEvidence };
}

export function actionToolAllowlist(
  tools: FrontendToolDescriptorV1[],
  decision: IntentDecision,
): FrontendToolDescriptorV1[] {
  if (decision.route !== "action" || !decision.explicitActionEvidence)
    return [];
  const requested = new Set(decision.requestedToolNames);
  return tools.filter((tool) => {
    if (tool.requiresConfirmation && tool.riskLevel === "high") return false;
    return requested.size === 0 || requested.has(tool.name);
  });
}

export function assertServerToolMetadata(tool: {
  name: string;
  metadata?: unknown;
}): void {
  const metadata = tool.metadata as Record<string, unknown> | undefined;
  if (
    !metadata ||
    !["knowledge", "web", "project"].includes(String(metadata.domain)) ||
    !["read", "write", "external"].includes(String(metadata.effect)) ||
    !["low", "medium", "high"].includes(String(metadata.risk))
  ) {
    throw new Error(
      `Server tool ${tool.name} must declare valid domain/effect/risk metadata`,
    );
  }
}
