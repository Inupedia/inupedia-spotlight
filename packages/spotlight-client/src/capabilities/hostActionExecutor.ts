import type { HostActionAckV2, HostActionNackV2, HostActionRequestV2, HostActionResultV2 } from "@inupedia/spotlight-protocol";
import type { FrontendToolRegistryV1 } from "../tools/frontendTool.js";
import { validateJsonSchemaV1 } from "./jsonSchema.js";

export interface CapabilityExecutionFenceV1 { sessionId: string; capabilitySnapshotId: string; leaseId: string; leaseVersion: number; connectionId: string; connectionEpoch: number; browserInstanceId: string; tabInstanceId: string }
type HostMessage = HostActionAckV2 | HostActionNackV2 | HostActionResultV2;
const FENCE_FIELDS = ["sessionId", "capabilitySnapshotId", "leaseId", "leaseVersion", "connectionId", "connectionEpoch", "browserInstanceId", "tabInstanceId"] as const;
function nack(request: HostActionRequestV2, code: string, message: string): HostActionNackV2 { const { type: _t, input: _i, deadlineAt: _d, idempotencyKey: _k, confirmationGrantId: _g, maxAttempts: _m, ...fence } = request; return { ...fence, type: "host_action_nack", status: "nack", handlerStarted: false, error: { code, message } }; }

export function createHostActionExecutor(options: { registry: FrontendToolRegistryV1; fence: CapabilityExecutionFenceV1 | (() => CapabilityExecutionFenceV1) }) {
  const executeStreaming = async (request: HostActionRequestV2, emit: (message: HostMessage) => void): Promise<void> => {
    const current = typeof options.fence === "function" ? options.fence() : options.fence;
    const reject = (code: string, message: string) => { emit(nack(request, code, message)); };
    if (FENCE_FIELDS.some((field) => request[field] !== current[field])) return reject("CAPABILITY_LEASE_FENCED", "Host action fence is stale.");
    const tool = options.registry.get(request.tool.name, request.tool.version);
    if (!tool || request.tool.target !== "browser") return reject("TOOL_NOT_REGISTERED", "Frontend Tool is not registered.");
    if (!options.registry.liveTools().some((entry) => entry.name === tool.name && entry.version === tool.version)) return reject("HOST_OFFLINE", "Frontend Tool handler is not live.");
    const inputError = validateJsonSchemaV1(tool.inputSchema, request.input);
    if (inputError) return reject("TOOL_INPUT_INVALID", inputError);
    const deadlineAt = Date.parse(request.deadlineAt);
    const delay = deadlineAt - Date.now();
    if (!Number.isFinite(deadlineAt) || delay <= 0) return reject("HOST_ACTION_TIMEOUT", "Host action deadline is invalid or elapsed.");
    const { type: _t, input: _i, deadlineAt: _d, idempotencyKey: _k, confirmationGrantId: _g, maxAttempts: _m, ...fence } = request;
    emit({ ...fence, type: "host_action_ack", status: "ack" });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, rejectDeadline) => { const schedule=()=>{const remaining=deadlineAt-Date.now(); if(remaining<=0){controller.abort("deadline");rejectDeadline(new SpotlightDeadlineError());return;} timer=setTimeout(schedule,Math.min(remaining,0x7fffffff));}; schedule(); });
    try {
      const output = await Promise.race([Promise.resolve(tool.execute(request.input, { projectId: options.registry.projectId, sessionId: request.sessionId, callId: request.callId, attempt: request.attempt, fence, ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}), signal: controller.signal })), deadline]);
      const outputError = tool.outputSchema ? validateJsonSchemaV1(tool.outputSchema, output) : undefined;
      if (outputError) return emit({ ...fence, type: "host_action_result", outcome: "threw", error: { code: "TOOL_OUTPUT_INVALID", message: outputError } });
      const bytes = new TextEncoder().encode(JSON.stringify(output ?? null)).byteLength;
      if (bytes > (tool.maxOutputBytes ?? 1024 * 1024)) return emit({ ...fence, type: "host_action_result", outcome: "threw", error: { code: "TOOL_OUTPUT_INVALID", message: "Frontend Tool output exceeds maxOutputBytes." } });
      emit({ ...fence, type: "host_action_result", outcome: "returned", output });
    } catch (error) {
      emit({ ...fence, type: "host_action_result", outcome: "threw", error: { code: error instanceof SpotlightDeadlineError ? "UNKNOWN_OUTCOME" : "TOOL_RUN_FAILED", message: error instanceof Error ? error.message : "Frontend Tool failed." } });
    } finally { if (timer) clearTimeout(timer); }
  };
  return Object.freeze({
    executeStreaming,
    async execute(request: HostActionRequestV2): Promise<HostMessage[]> { const messages: HostMessage[] = []; await executeStreaming(request, (message) => messages.push(message)); return messages; },
  });
}
class SpotlightDeadlineError extends Error { constructor() { super("Frontend Tool deadline elapsed."); } }
