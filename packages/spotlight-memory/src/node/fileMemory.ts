import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

export const FILE_MEMORY_ENTRYPOINT = "MEMORY.md";

export type SpotlightFileMemoryScope =
  | "managed"
  | "user"
  | "project"
  | "local"
  | "auto"
  | "agent-user"
  | "agent-project"
  | "agent-local"
  | "session";

export interface SpotlightFileMemoryInfo {
  path: string;
  type: SpotlightFileMemoryScope;
  content: string;
}

export interface SpotlightFileMemoryPaths {
  baseDir: string;
  projectDir: string;
  autoDir: string;
  autoEntrypoint: string;
  sessionDir?: string;
  sessionEntrypoint?: string;
}

export interface ResolveSpotlightFileMemoryPathsOptions {
  projectId: string;
  baseDir?: string;
  sessionId?: string | null;
}

export interface LoadSpotlightFileMemoryOptions
  extends ResolveSpotlightFileMemoryPathsOptions {
  cwd?: string;
  includeProjectFiles?: boolean;
  includeAutoMemory?: boolean;
  includeSessionMemory?: boolean;
  agent?: {
    type: string;
    scope: "user" | "project" | "local";
  };
  maxFileChars?: number;
  maxTotalChars?: number;
}

export interface BuildSpotlightFileMemoryPromptOptions
  extends LoadSpotlightFileMemoryOptions {
  emptyText?: string;
}

function normalizeDir(path: string): string {
  const resolved = resolve(path);
  return resolved.endsWith(sep) ? resolved : `${resolved}${sep}`;
}

function sanitizePathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[/\\:]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 160) || "default"
  );
}

function resolveBaseDir(baseDir?: string): string {
  const raw =
    baseDir?.trim() ||
    process.env.SPOTLIGHT_MEMORY_DIR?.trim() ||
    join(homedir(), ".spotlight");
  return resolve(raw);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 80)).trimEnd()}\n\n<!-- truncated by Spotlight memory: ${text.length - maxChars} chars omitted -->`;
}

async function readUtf8File(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") return null;
    throw error;
  }
}

async function readMemoryFile(
  path: string,
  type: SpotlightFileMemoryScope,
  maxChars: number,
): Promise<SpotlightFileMemoryInfo | null> {
  const content = await readUtf8File(path);
  if (content == null) return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  return { path, type, content: truncate(trimmed, maxChars) };
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = resolve(path);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parentDirsFromRoot(cwd: string): string[] {
  const dirs: string[] = [];
  let current = resolve(cwd);
  while (true) {
    dirs.unshift(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

async function listRulesFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => join(dir, entry.name))
      .sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
}

export function resolveSpotlightFileMemoryPaths(
  options: ResolveSpotlightFileMemoryPathsOptions,
): SpotlightFileMemoryPaths {
  const baseDir = resolveBaseDir(options.baseDir);
  const projectDir = join(baseDir, "projects", sanitizePathSegment(options.projectId));
  const autoDir = join(projectDir, "memory");
  const paths: SpotlightFileMemoryPaths = {
    baseDir,
    projectDir,
    autoDir: normalizeDir(autoDir),
    autoEntrypoint: join(autoDir, FILE_MEMORY_ENTRYPOINT),
  };
  const sessionId = options.sessionId?.trim();
  if (sessionId) {
    const sessionDir = join(projectDir, "sessions", sanitizePathSegment(sessionId), "memory");
    paths.sessionDir = normalizeDir(sessionDir);
    paths.sessionEntrypoint = join(sessionDir, FILE_MEMORY_ENTRYPOINT);
  }
  return paths;
}

export function resolveAgentMemoryDir(options: {
  projectId: string;
  agentType: string;
  scope: "user" | "project" | "local";
  baseDir?: string;
  cwd?: string;
}): string {
  const agentType = sanitizePathSegment(options.agentType);
  if (options.scope === "project") {
    return normalizeDir(
      join(resolve(options.cwd ?? process.cwd()), ".spotlight", "agent-memory", agentType),
    );
  }
  if (options.scope === "local") {
    return normalizeDir(
      join(
        resolve(options.cwd ?? process.cwd()),
        ".spotlight",
        "agent-memory-local",
        agentType,
      ),
    );
  }
  return normalizeDir(
    join(resolveBaseDir(options.baseDir), "agent-memory", agentType),
  );
}

export function resolveAgentMemoryEntrypoint(options: {
  projectId: string;
  agentType: string;
  scope: "user" | "project" | "local";
  baseDir?: string;
  cwd?: string;
}): string {
  return join(resolveAgentMemoryDir(options), FILE_MEMORY_ENTRYPOINT);
}

export async function ensureSpotlightFileMemoryEntrypoints(
  options: ResolveSpotlightFileMemoryPathsOptions,
): Promise<SpotlightFileMemoryPaths> {
  const paths = resolveSpotlightFileMemoryPaths(options);
  await mkdir(paths.autoDir, { recursive: true });
  if (!(await readUtf8File(paths.autoEntrypoint))) {
    await writeFile(paths.autoEntrypoint, "", "utf8");
  }
  if (paths.sessionDir && paths.sessionEntrypoint) {
    await mkdir(paths.sessionDir, { recursive: true });
    if (!(await readUtf8File(paths.sessionEntrypoint))) {
      await writeFile(paths.sessionEntrypoint, "", "utf8");
    }
  }
  return paths;
}

export async function appendSpotlightFileMemory(options: {
  filePath: string;
  content: string;
  heading?: string;
}): Promise<void> {
  const content = options.content.trim();
  if (!content) return;
  await mkdir(dirname(options.filePath), { recursive: true });
  const existing = (await readUtf8File(options.filePath)) ?? "";
  const heading = options.heading?.trim();
  const next = [
    existing.trimEnd(),
    heading ? `\n\n## ${heading}` : "",
    `\n\n${content}`,
    "\n",
  ]
    .join("")
    .replace(/^\n+/, "");
  await writeFile(options.filePath, next, "utf8");
}

export async function loadSpotlightFileMemories(
  options: LoadSpotlightFileMemoryOptions,
): Promise<SpotlightFileMemoryInfo[]> {
  const maxFileChars = options.maxFileChars ?? 8_000;
  const paths = resolveSpotlightFileMemoryPaths(options);
  const candidates: Array<{ path: string; type: SpotlightFileMemoryScope }> = [];

  if (options.includeProjectFiles !== false) {
    const cwd = resolve(options.cwd ?? process.cwd());
    const homeMemory = join(resolveBaseDir(options.baseDir), FILE_MEMORY_ENTRYPOINT);
    candidates.push({ path: homeMemory, type: "user" });
    for (const dir of parentDirsFromRoot(cwd)) {
      candidates.push({ path: join(dir, "CLAUDE.md"), type: "project" });
      candidates.push({ path: join(dir, "SPOTLIGHT.md"), type: "project" });
      candidates.push({ path: join(dir, ".claude", "CLAUDE.md"), type: "project" });
      candidates.push({ path: join(dir, ".spotlight", FILE_MEMORY_ENTRYPOINT), type: "project" });
      for (const rulesFile of await listRulesFiles(join(dir, ".claude", "rules"))) {
        candidates.push({ path: rulesFile, type: "project" });
      }
      candidates.push({ path: join(dir, "CLAUDE.local.md"), type: "local" });
      candidates.push({ path: join(dir, "SPOTLIGHT.local.md"), type: "local" });
    }
  }

  if (options.includeAutoMemory !== false) {
    candidates.push({ path: paths.autoEntrypoint, type: "auto" });
  }

  if (
    options.includeSessionMemory !== false &&
    paths.sessionEntrypoint &&
    paths.sessionDir
  ) {
    candidates.push({ path: paths.sessionEntrypoint, type: "session" });
  }

  if (options.agent) {
    const agentPath = resolveAgentMemoryEntrypoint({
      projectId: options.projectId,
      agentType: options.agent.type,
      scope: options.agent.scope,
      baseDir: options.baseDir,
      cwd: options.cwd,
    });
    const type =
      options.agent.scope === "user"
        ? "agent-user"
        : options.agent.scope === "project"
          ? "agent-project"
          : "agent-local";
    candidates.push({ path: agentPath, type });
  }

  const result: SpotlightFileMemoryInfo[] = [];
  for (const path of uniquePaths(candidates.map((item) => item.path))) {
    const candidate = candidates.find((item) => resolve(item.path) === path);
    if (!candidate) continue;
    const memory = await readMemoryFile(path, candidate.type, maxFileChars);
    if (memory) result.push(memory);
  }
  return result;
}

function typeLabel(type: SpotlightFileMemoryScope): string {
  switch (type) {
    case "managed":
      return "Managed";
    case "user":
      return "User";
    case "project":
      return "Project";
    case "local":
      return "Local";
    case "auto":
      return "Auto";
    case "agent-user":
      return "Agent/User";
    case "agent-project":
      return "Agent/Project";
    case "agent-local":
      return "Agent/Local";
    case "session":
      return "Session";
  }
}

export async function buildSpotlightFileMemoryPrompt(
  options: BuildSpotlightFileMemoryPromptOptions,
): Promise<string> {
  const maxTotalChars = options.maxTotalChars ?? 24_000;
  const memories = await loadSpotlightFileMemories(options);
  if (memories.length === 0) {
    return options.emptyText ?? "";
  }

  const body = memories
    .map(
      (memory) =>
        `### ${typeLabel(memory.type)} Memory\nPath: ${memory.path}\n\n${memory.content}`,
    )
    .join("\n\n");
  return truncate(
    [
      "【长期记忆】",
      "下面内容来自 Spotlight 的持久文件记忆系统。它们是项目规则、用户偏好、agent 经验与会话摘要，不是用户当前这句话本身。",
      "使用原则：",
      "- 与用户当前请求冲突时，以当前请求为准。",
      "- 不要凭记忆编造实时数据；实时状态必须调用工具确认。",
      "- 当用户明确要求记住偏好、事实或项目约定时，应写入对应 memory 文件，而不是只放在本轮回答里。",
      "",
      body,
    ].join("\n"),
    maxTotalChars,
  );
}

export function isSpotlightFileMemoryPath(
  absolutePath: string,
  options: ResolveSpotlightFileMemoryPathsOptions,
): boolean {
  if (!isAbsolute(absolutePath)) return false;
  const paths = resolveSpotlightFileMemoryPaths(options);
  const normalized = resolve(absolutePath);
  return (
    normalized.startsWith(paths.autoDir) ||
    Boolean(paths.sessionDir && normalized.startsWith(paths.sessionDir))
  );
}
