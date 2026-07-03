export function getLlmTimeoutMs(): number {
  const env = import.meta.env as Record<string, string | undefined>;
  return Number(
    env.VITE_LLM_TIMEOUT_MS ?? env.VITE_QWEN_TIMEOUT_MS ?? 20_000,
  );
}

function stripJsonFromMarkdown(s: string): string {
  const trimmed = s.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  return match ? match[1].trim() : trimmed;
}

export function parseJsonContent<T>(content: unknown): T {
  if (typeof content === "string") {
    return JSON.parse(stripJsonFromMarkdown(content)) as T;
  }
  return content as T;
}
