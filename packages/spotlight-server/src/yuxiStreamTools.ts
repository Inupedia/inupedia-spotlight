import type {
  SpotlightKnowledgeToolStreamEvent,
  SpotlightToolCallInfo,
} from "./contracts.js";

export interface YuxiToolCallState {
  id: string;
  name: string;
  argsText: string;
  resultText?: string;
  started: boolean;
}

interface YuxiStreamEvent {
  type?: string | null;
  name?: string | null;
  tool_call_id?: string | null;
  args?: unknown;
  args_delta?: string | null;
  index?: number | null;
  content?: string | null;
}

interface YuxiStreamMessage {
  type?: string | null;
  name?: string | null;
  id?: string | null;
  tool_call_id?: string | null;
  content?: unknown;
  tool_calls?: Array<{
    id?: string | null;
    name?: string | null;
    args?: unknown;
    function?: { name?: string | null; arguments?: string | null } | null;
  }> | null;
  tool_call_chunks?: Array<{
    id?: string | null;
    name?: string | null;
    args?: string | null;
    index?: number | null;
  }> | null;
}

export interface YuxiStreamChunk {
  msg?: YuxiStreamMessage | null;
  stream_event?: YuxiStreamEvent | null;
  event?: {
    method?: string | null;
    data?: {
      event?: string | null;
      tool_call_id?: string | null;
      output?: Record<string, unknown> | null;
    } | null;
  } | null;
}

function stringifyArgs(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseInput(argsText: string): Record<string, unknown> {
  const trimmed = argsText.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // keep raw text
  }
  return { raw: trimmed };
}

function toCall(state: YuxiToolCallState): SpotlightToolCallInfo {
  return {
    id: state.id,
    name: state.name,
    input: parseInput(state.argsText),
    displayName: state.name,
  };
}

function upsertState(
  state: Map<string, YuxiToolCallState>,
  id: string,
  name?: string | null,
  args?: { delta?: string; replace?: string },
): YuxiToolCallState {
  const previous = state.get(id);
  const replaced = args?.replace?.trim();
  const next: YuxiToolCallState = {
    id,
    name: name?.trim() || previous?.name || "",
    argsText: replaced
      ? replaced
      : `${previous?.argsText ?? ""}${args?.delta ?? ""}`,
    resultText: previous?.resultText,
    started: previous?.started ?? false,
  };
  if (!next.name) next.name = previous?.name || id;
  state.set(id, next);
  return next;
}

function startOrProgress(
  events: SpotlightKnowledgeToolStreamEvent[],
  item: YuxiToolCallState,
): void {
  const call = toCall(item);
  if (!item.started) {
    item.started = true;
    events.push({ type: "start", call });
    return;
  }
  events.push({
    type: "progress",
    call,
    summary: `正在调用知识库工具：${item.name}`,
  });
}

function complete(
  events: SpotlightKnowledgeToolStreamEvent[],
  item: YuxiToolCallState,
  output: unknown,
): void {
  item.resultText = stringifyArgs(output);
  item.started = true;
  events.push({
    type: "result",
    call: toCall(item),
    success: true,
    summary: `${item.name} 已返回结果`,
    output,
  });
}

export function collectYuxiStreamChunks(envelope: unknown): YuxiStreamChunk[] {
  if (!envelope || typeof envelope !== "object") return [];
  const record = envelope as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : undefined;
  const chunks: unknown[] = [];
  if (Array.isArray(payload?.items)) chunks.push(...payload.items);
  if (payload?.chunk) chunks.push(payload.chunk);
  if (payload && (payload.stream_event || payload.msg || payload.event)) {
    chunks.push(payload);
  }
  if (record.stream_event || record.msg || record.event) chunks.push(record);
  return chunks.filter((item): item is YuxiStreamChunk =>
    Boolean(item && typeof item === "object"),
  );
}

export function applyYuxiStreamChunk(
  state: Map<string, YuxiToolCallState>,
  chunk: YuxiStreamChunk,
): SpotlightKnowledgeToolStreamEvent[] {
  const events: SpotlightKnowledgeToolStreamEvent[] = [];
  const streamEvent = chunk.stream_event;
  const msg = chunk.msg;

  if (streamEvent?.type === "tool_call_delta") {
    const id =
      streamEvent.tool_call_id || `tool-index-${streamEvent.index ?? 0}`;
    const item = upsertState(state, id, streamEvent.name, {
      delta: streamEvent.args_delta ?? "",
    });
    if (item.name) startOrProgress(events, item);
  } else if (streamEvent?.type === "tool_call") {
    const id =
      streamEvent.tool_call_id || streamEvent.name || "yuxi-tool-call";
    const item = upsertState(state, id, streamEvent.name, {
      replace: stringifyArgs(streamEvent.args),
    });
    if (item.name) startOrProgress(events, item);
  }

  if (Array.isArray(msg?.tool_call_chunks)) {
    for (const part of msg.tool_call_chunks) {
      if (!part?.id && part?.index == null && !part?.name) continue;
      const id = part.id || `tool-index-${part.index ?? 0}`;
      const item = upsertState(state, id, part.name, { delta: part.args ?? "" });
      if (item.name) startOrProgress(events, item);
    }
  }

  if (Array.isArray(msg?.tool_calls)) {
    for (const toolCall of msg.tool_calls) {
      const name = toolCall.name || toolCall.function?.name;
      if (!toolCall.id && !name) continue;
      const id = toolCall.id || name || "yuxi-tool-call";
      const args =
        stringifyArgs(toolCall.args) || toolCall.function?.arguments || "";
      const item = upsertState(state, id, name, { replace: args });
      if (item.name) startOrProgress(events, item);
    }
  }

  if (msg?.type === "tool") {
    const id = msg.tool_call_id || msg.id || msg.name || "yuxi-tool-result";
    const item = upsertState(state, id, msg.name);
    complete(events, item, msg.content);
  }

  const finished = chunk.event;
  if (finished?.method === "tools" && finished.data?.event === "tool-finished") {
    const output = finished.data.output ?? {};
    const id =
      (typeof output.tool_call_id === "string" && output.tool_call_id) ||
      (typeof output.id === "string" && output.id) ||
      finished.data.tool_call_id ||
      (typeof output.name === "string" && output.name) ||
      "yuxi-tool-result";
    const name =
      (typeof output.name === "string" && output.name) ||
      state.get(id)?.name ||
      "知识库工具";
    const item = upsertState(state, id, name);
    complete(events, item, output.content ?? output);
  }

  return events;
}
