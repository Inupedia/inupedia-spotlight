/**
 * Inupedia Agent Skills 参考实现 ↔ Spotlight 模块映射。
 * 布局与行为对齐 Inupedia Agent Skills 开放约定（渐进披露 + skill.invoke）。
 */

/** 通用 Agent Skills 目录布局（其它产品可能用不同根路径） */
export const AGENT_SKILLS_LAYOUT = {
  entryFile: "SKILL.md",
  supportDirs: ["scripts", "references", "templates", "examples"] as const,
} as const;

/** Inupedia 项目技能包路径 */
export const INUPEDIA_SKILL_LAYOUT = {
  projectRoot: ".inupedia/skills/<skill-id>/SKILL.md",
  entryFile: "SKILL.md",
  supportDirs: ["scripts", "references", "templates", "examples"] as const,
} as const;

/**
 * 渐进披露 — Inupedia Spotlight 标准加载模型。
 *
 * Level 1: 仅 frontmatter 进入 skill 名录
 * Level 2: skill.invoke 后加载 SKILL.md + references/templates/examples
 * scripts/: 附录列路径；宿主 skillExecution hook 或 MCP 执行
 */
export const INUPEDIA_SKILL_LOAD_MODEL = {
  level1Fields: [
    "name",
    "description",
    "when_to_use",
    "allowed-tools",
    "disable-model-invocation",
    "user-invocable",
  ],
  level2Content: ["SKILL.md body", "references/", "templates/", "examples/"],
  scriptsPolicy: {
    host: "skill.runScript + ${INUPEDIA_SKILL_DIR}/scripts；或 SKILL 内 !`cmd`（宿主 runInlineShell）",
    saas: "附录备案；不在服务端执行",
    mcp: "allowed-tools 引用 MCP tool 名",
  },
} as const;

/** Skill 正文占位符（宿主渲染 skill 内容时替换） */
export const INUPEDIA_SKILL_PLACEHOLDERS = {
  skillDir: "${INUPEDIA_SKILL_DIR}",
  projectDir: "${INUPEDIA_PROJECT_DIR}",
  sessionId: "${INUPEDIA_SESSION_ID}",
  /** 兼容旧模板，解析时等同 INUPEDIA_SKILL_DIR */
  legacySkillDir: "${CLAUDE_SKILL_DIR}",
  legacyProjectDir: "${CLAUDE_PROJECT_DIR}",
} as const;

/** 参考能力 → Spotlight 实现位置 */
export const INUPEDIA_SKILLS_REFERENCE_MAP = {
  skillDirectoryLoader: {
    spotlight: [
      "packages/spotlight-vue/src/skills/skillFrontmatterParse.ts",
      "宿主 import.meta.glob('.inupedia/skills/**/SKILL.md')",
      "spotlight-server/src/packs/projectPack.ts",
    ],
    notes: "宿主 eager glob + 服务端 project pack",
  },
  skillInvokeTool: {
    spotlight: [
      "spotlight-server/src/runtime/skillInvoke.ts",
      "skill.invoke",
    ],
    notes: "inline 注入 allowedTools；context:fork → forkedSkillAgent",
  },
  skillListingBudget: {
    spotlight: [
      "spotlight-server/src/runtime/skillListing.ts",
      "packages/spotlight-vue/src/skills/skillListing.ts",
    ],
  },
  argumentSubstitution: {
    spotlight: ["spotlight-server/src/runtime/argumentSubstitution.ts"],
  },
  skillScriptExecution: {
    spotlight: [
      "packages/spotlight-client/src/skillPrompt.ts",
      "packages/spotlight-client/src/skillScriptTool.ts",
    ],
    notes: "宿主注入 runScript / runInlineShell；SaaS 不执行",
  },
  mcpSkills: {
    spotlight: ["allowed-tools 写 MCP tool 名；消费端接 MCP 服务器"],
  },
  invokedSkillRegistry: {
    spotlight: [
      "spotlight-server/src/runtime/invokedSkills.ts",
      "spotlight-server/src/runtime/invokeToolGuard.ts",
    ],
  },
} as const;

/**
 * Skills 与 Service 分工（Inupedia 标准）。
 * Service = 宿主可执行 tool 注册表；Skills = 知识 + allowed-tools 白名单。
 */
export const INUPEDIA_SKILLS_SERVICE_MODEL = {
  skills: {
    role: "知识 + 流程 + allowed-tools",
    path: ".inupedia/skills/",
  },
  service: {
    role: "host tool 注册与 invoke",
    path: "src/service/agent/",
  },
  apiCalls: {
    skillScript: "skill/scripts/ + skill.runScript 或 SKILL 内 !`cmd`",
    mcp: "MCP tool 写入 allowed-tools",
    hostTool: "@agent capabilities + resolveAgentMeta",
  },
} as const;

/** Agent Skills 通用 frontmatter 字段 */
export const INUPEDIA_SHARED_SKILL_FRONTMATTER = [
  "name",
  "description",
  "when_to_use",
  "allowed-tools",
  "argument-hint",
  "arguments",
  "disable-model-invocation",
  "user-invocable",
  "disallowed-tools",
  "paths",
  "context",
  "agent",
  "model",
  "effort",
  "hooks",
  "shell",
] as const;

/** Inupedia Spotlight 扩展字段 */
export const INUPEDIA_SKILL_EXTENSIONS = [
  "id",
  "spotlight-response-strategy",
  "spotlight-asset-types",
  "capability-examples",
] as const;
