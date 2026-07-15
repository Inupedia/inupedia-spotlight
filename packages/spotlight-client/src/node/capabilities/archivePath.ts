import { containsLoneSurrogate } from "./canonicalJson.js";

export function canonicalArchivePathProblem(
  path: string,
  options: { directory?: boolean } = {},
): string | undefined {
  const directory = options.directory === true;
  const normalized = directory && path.endsWith("/") ? path.slice(0, -1) : path;
  if (!normalized) return "path is empty";
  if (normalized.startsWith("/")) return "path is absolute";
  if (/^[A-Za-z]:/.test(normalized)) return "path has a Windows drive prefix";
  if (normalized.includes("\\")) return "path contains a backslash";
  if (normalized.includes("\0")) return "path contains NUL";
  if (containsLoneSurrogate(normalized)) return "path contains a lone surrogate";
  if (!directory && path.endsWith("/")) return "file path has a trailing slash";
  if (normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return "path contains an empty or dot segment";
  return undefined;
}
