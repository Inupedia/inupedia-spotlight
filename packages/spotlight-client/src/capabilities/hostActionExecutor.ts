import type {
  HostActionAckV2,
  HostActionNackV2,
  HostActionRequestV2,
  HostActionResultV2,
} from "@inupedia/spotlight-protocol";
import type { FrontendToolRegistryV1 } from "../tools/frontendTool.js";
import { validateJsonSchemaValue } from "./jsonSchema.js";

export interface CapabilityExecutionFenceV1 {
  sessionId: string;
  capabilitySnapshotId: string;
  leaseId: string;
  leaseVersion: number;
  connectionId: string;
  connectionEpoch: number;
  browserInstanceId: string;
  tabInstanceId: string;
}

const FENCE_FIELDS = ["sessionId", "capabilitySnapshotId", "leaseId", "leaseVersion", "connectionId", "connectionEpoch", "browserInstanceId", "tabInstanceId"] as const;

function nack(request: HostActionRequestV2, code: string, message: string): HostActionNackV2 {
  const { type: _type, input: _input, deadlineAt: _deadline, idempotencyKey: _key, confirmationGrantId: _grant, maxAttempts: _max, ...fence } = request;
  return { ...fence, type: "host_action_nack", status: "nack", handlerStarted: false, error: { code, message } };
}

export function createHostActionExecutor(options: {
  registry: FrontendToolRegistryV1;
  fence: CapabilityExecutionFenceV1 | (() => CapabilityExecutionFenceV1);
}) {
  return Object.freeze({
    async execute(request: HostActionRequestV2): Promise<Array<HostActionAckV2 | HostActionNackV2 | HostActionResultV2>> {
      const current = typeof options.fence === "function" ? options.fence() : options.fence;
      if (FENCE_FIELDS.some((field) => request[field] !== current[field])) {
        return [nack(request, "CAPABILITY_LEASE_FENCED", "Host action fence is stale.")];
      }
      const tool = options.registry.get(request.tool.name, request.tool.version);
      if (!tool || request.tool.target !== "browser") {
        return [nack(request, "TOOL_NOT_REGISTERED", "Frontend Tool is not registered.")];
      }
      if (!options.registry.liveTools().some((entry) => entry.name === tool.name && entry.version === tool.version)) {
        return [nack(request, "HOST_OFFLINE", "Frontend Tool handler is not live.")];
      }
      if (Date.parse(request.deadlineAt) <= Date.now()) {
        return [nack(request, "HOST_ACTION_TIMEOUT", "Host action deadline has elapsed.")];
      }
      if (!validateJsonSchemaValue(tool.inputSchema, request.input)) {
        return [nack(request, "TOOL_INPUT_INVALID", "Frontend Tool input does not match inputSchema.")];
      }
      const { type: _type, input: _input, deadlineAt: _deadline, idempotencyKey: _key, confirmationGrantId: _grant, maxAttempts: _max, ...fence } = request;
      const ack: HostActionAckV2 = { ...fence, type: "host_action_ack", status: "ack" };
      const controller = new AbortController();
      const delay = Math.max(0, Date.parse(request.deadlineAt) - Date.now());
      const timeout = setTimeout(() => controller.abort("deadline"), delay);
      try {
        const output = await tool.execute(request.input, {
          projectId: options.registry.projectId,
          sessionId: request.sessionId,
          callId: request.callId,
          attempt: request.attempt,
          fence,
          ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
          signal: controller.signal,
        });
        const outputBytes = new TextEncoder().encode(JSON.stringify(output ?? null)).byteLength;
        if (tool.outputSchema && !validateJsonSchemaValue(tool.outputSchema, output)) {
          return [ack, { ...fence, type: "host_action_result", outcome: "threw", error: { code: "TOOL_OUTPUT_INVALID", message: "Frontend Tool output does not match outputSchema." } }];
        }
        if (outputBytes > (tool.maxOutputBytes ?? 1024 * 1024)) {
          return [ack, { ...fence, type: "host_action_result", outcome: "threw", error: { code: "TOOL_OUTPUT_INVALID", message: "Frontend Tool output exceeds maxOutputBytes." } }];
        }
        return [ack, { ...fence, type: "host_action_result", outcome: "returned", output }];
      } catch (error) {
        const code = controller.signal.aborted ? "HOST_ACTION_TIMEOUT" : "TOOL_RUN_FAILED";
        return [ack, { ...fence, type: "host_action_result", outcome: "threw", error: { code, message: error instanceof Error ? error.message : "Frontend Tool failed." } }];
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
