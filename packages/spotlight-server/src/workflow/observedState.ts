import {
  CAPABILITY_SECURITY_LIMITS_V1,
  type AgentUiContext,
} from "@inupedia/spotlight-protocol";

const MAX_BYTES = CAPABILITY_SECURITY_LIMITS_V1.maxObservedStateBytes;
const MAX_VALUE_CHARS = 400;

function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return JSON.stringify(value).slice(0, MAX_VALUE_CHARS);
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    if (!json || json === "{}") return null;
    return json.slice(0, MAX_VALUE_CHARS);
  }
  return null;
}

/**
 * Flatten a host observation into stable `key: value` lines.
 *
 * Keys are sorted so the same page state always produces the same prompt text,
 * which keeps model caching and snapshot tests meaningful.
 */
export function formatObservedState(
  observed: AgentUiContext | undefined,
): string {
  if (!observed || typeof observed !== "object") return "";
  const lines: string[] = [];
  for (const key of Object.keys(observed).sort()) {
    const rendered = renderValue(observed[key]);
    if (rendered === null) continue;
    lines.push(`${key}: ${rendered}`);
  }
  if (lines.length === 0) return "";
  let text = lines.join("\n");
  if (text.length > MAX_BYTES) {
    text = `${text.slice(0, MAX_BYTES)}\n…(observation truncated)`;
  }
  return text;
}

/**
 * Prompt block for the current page observation.
 *
 * This is a fact about the page, not a user assertion, and it is refreshed after
 * every host call — so a later block supersedes an earlier one.
 */
export function observedStatePromptBlock(
  observed: AgentUiContext | undefined,
): string {
  const body = formatObservedState(observed);
  if (!body) return "";
  return [
    "Observed page state (measured from the live UI, not asserted by the user):",
    body,
    "Trust this over anything the conversation implies about what is currently on screen.",
  ].join("\n");
}

export function observedStateForRouter(
  observed: AgentUiContext | undefined,
): string | undefined {
  return formatObservedState(observed) || undefined;
}
