/**
 * Pipeline：Handler 接口与上下文类型
 */

import type {
  AgentStep,
  AgentStepAttachment,
  AgentStepChatItem,
  AgentStepFile,
  AgentStepToolCall,
  IntentWithReason,
  SpotlightCommand,
  SpotlightArtifact,
} from "../types";
import type { SpotlightIntent } from "../types";
import type { ToolResult } from "../../types/toolResult.js";
import type { SessionControlIntent } from "../../types/session.js";
import type { SpotlightExecutionEvent } from "../runtime/types";

export type ToolSummaryKind = "tool" | "no_tool";

export interface StreamToolSummaryParams {
  intentLabel: string;
  subLabel: string;
  stepId: string;
  kind: ToolSummaryKind;
}

/** 执行上下文：通用阶段产出 + 解析后的 intent/subIntent 等 */
export interface SpotlightContext {
  userQuestion: string;
  breakdown: string;
  intentRes: IntentWithReason;
  intent: SpotlightIntent;
  rawSubIntent: string | undefined;
  intentLabel: string;
  command?: SpotlightCommand | null;
  sessionControlIntent?: SessionControlIntent | null;
}

/** 提供给 handler 的 API，由 store 实现，避免 handler 直接依赖 pinia */
export interface SpotlightRuntimeSink {
  getSignal(): AbortSignal | undefined;
  getSteps(): AgentStep[];
  setSteps(steps: AgentStep[]): void;
  setStep(id: string, status: AgentStep["status"], content?: string): void;
  typewriterToStep(
    stepId: string,
    fullText: string,
    msPerChar?: number,
  ): Promise<void>;
  typewriterAppendToStep(
    stepId: string,
    suffix: string,
    msPerChar?: number,
  ): Promise<void>;
  /** 触发施工进度展示（程序化控制器） */
  triggerProgressAction(): Promise<ToolResult<void>>;
  /** 触发模拟进度展示（程序化控制器） */
  triggerSimulationProgressAction(): Promise<ToolResult<void>>;
  setError(msg: string): void;
  setResult(json: string): void;
  /** 流式写 step 内容：用于「使用工具」等步骤的 LLM 一句话说明 */
  appendChunkToStep(stepId: string, chunk: string): void;
  appendAttachmentsToStep(
    stepId: string,
    attachments: AgentStepAttachment[],
  ): void;
  appendChatItemsToStep(stepId: string, items: AgentStepChatItem[]): void;
  appendFilesToStep(stepId: string, files: AgentStepFile[]): void;
  appendArtifactsToStep(stepId: string, artifacts: SpotlightArtifact[]): void;
  appendToolCallsToStep(stepId: string, toolCalls: AgentStepToolCall[]): void;
  appendExecutionEvent?(event: SpotlightExecutionEvent): void;
  /** 调用当前 LLM 供应商流式生成一句话说明（工具/无工具），写进指定 step */
  streamToolSummary(params: StreamToolSummaryParams): Promise<string>;
}

export type HandlerApi = SpotlightRuntimeSink;
