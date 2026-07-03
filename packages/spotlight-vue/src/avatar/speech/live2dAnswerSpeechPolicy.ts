const GENERIC_HOST_REPLY_PARTS = new Set([
  "前端操作已执行。",
  "前端操作已执行",
  "前端操作执行失败。",
  "前端操作执行失败",
]);

/** 纯宿主工具（打开 BIM / 监控等）默认短反馈，不适合占用数字人长口播。 */
export function isGenericHostExecutionReply(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  const parts = normalized
    .split(/[；;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every((part) => GENERIC_HOST_REPLY_PARTS.has(part));
}
