import { isMap, isScalar, parseDocument } from "yaml";

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const COMPAT_WARNING_CODES = new Set<AgentSkillDiagnosticCode>([
  "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
  "SKILL_NAME_INVALID_FORMAT",
  "SKILL_NAME_DIRECTORY_MISMATCH",
  "SKILL_ALLOWED_TOOLS_NOT_SPACE_DELIMITED",
]);

export type AgentSkillDiagnosticSeverity = "error" | "warning";

export type AgentSkillDiagnosticCode =
  | "SKILL_FRONTMATTER_MISSING"
  | "SKILL_FRONTMATTER_UNCLOSED"
  | "SKILL_FRONTMATTER_INVALID_YAML"
  | "SKILL_FRONTMATTER_NOT_MAPPING"
  | "SKILL_UNKNOWN_TOP_LEVEL_FIELD"
  | "SKILL_NAME_REQUIRED"
  | "SKILL_NAME_NOT_STRING"
  | "SKILL_NAME_INVALID_FORMAT"
  | "SKILL_NAME_TOO_LONG"
  | "SKILL_NAME_DIRECTORY_MISMATCH"
  | "SKILL_DESCRIPTION_REQUIRED"
  | "SKILL_DESCRIPTION_NOT_STRING"
  | "SKILL_DESCRIPTION_EMPTY"
  | "SKILL_DESCRIPTION_TOO_LONG"
  | "SKILL_LICENSE_NOT_STRING"
  | "SKILL_LICENSE_EMPTY"
  | "SKILL_COMPATIBILITY_NOT_STRING"
  | "SKILL_COMPATIBILITY_EMPTY"
  | "SKILL_COMPATIBILITY_TOO_LONG"
  | "SKILL_METADATA_NOT_MAPPING"
  | "SKILL_METADATA_KEY_NOT_STRING"
  | "SKILL_METADATA_VALUE_NOT_STRING"
  | "SKILL_ALLOWED_TOOLS_NOT_STRING"
  | "SKILL_ALLOWED_TOOLS_EMPTY"
  | "SKILL_ALLOWED_TOOLS_NOT_SPACE_DELIMITED"
  | "SKILL_RECOMMENDATION_LINES"
  | "SKILL_RECOMMENDATION_TOKENS"
  | "SKILL_REFERENCE_OUTSIDE_ROOT"
  | "SKILL_REFERENCE_CHAIN_DEEP";

export type AgentSkillDiagnostic = {
  code: AgentSkillDiagnosticCode;
  severity: AgentSkillDiagnosticSeverity;
  message: string;
  skillFile: string;
};

export type ValidatedAgentSkill = {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  allowedTools: string[];
  body: string;
};

export type ValidateAgentSkillMarkdownInput = {
  directoryName: string;
  skillFile: string;
  markdown: string;
  mode?: "strict" | "compat";
};

export type AgentSkillValidationResult = {
  ok: boolean;
  skill?: ValidatedAgentSkill;
  diagnostics: AgentSkillDiagnostic[];
};

function errorResult(
  skillFile: string,
  code: AgentSkillDiagnosticCode,
  message: string,
): AgentSkillValidationResult {
  return {
    ok: false,
    diagnostics: [{ code, severity: "error", message, skillFile }],
  };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function characterCount(value: string): number {
  return [...value].length;
}

function trimSurroundingBlankLines(value: string): string {
  const lines = value.split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  return lines.join("\n");
}

export function validateAgentSkillMarkdown(
  input: ValidateAgentSkillMarkdownInput,
): AgentSkillValidationResult {
  const normalized = input.markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  if (lines[0] !== "---") {
    return errorResult(
      input.skillFile,
      "SKILL_FRONTMATTER_MISSING",
      "SKILL.md must begin with an exact --- frontmatter delimiter.",
    );
  }

  const closingIndex = lines.indexOf("---", 1);
  if (closingIndex === -1) {
    return errorResult(
      input.skillFile,
      "SKILL_FRONTMATTER_UNCLOSED",
      "SKILL.md frontmatter must end with an exact --- delimiter.",
    );
  }

  const document = parseDocument(lines.slice(1, closingIndex).join("\n"), {
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    return errorResult(
      input.skillFile,
      "SKILL_FRONTMATTER_INVALID_YAML",
      `SKILL.md frontmatter is invalid YAML: ${document.errors[0]?.message ?? "unknown parse error"}`,
    );
  }

  const frontmatter: unknown = document.toJS();
  if (!isMapping(frontmatter)) {
    return errorResult(
      input.skillFile,
      "SKILL_FRONTMATTER_NOT_MAPPING",
      "SKILL.md frontmatter must be a YAML mapping.",
    );
  }

  const diagnostics: AgentSkillDiagnostic[] = [];
  const addError = (code: AgentSkillDiagnosticCode, message: string) => {
    const severity =
      input.mode === "compat" && COMPAT_WARNING_CODES.has(code)
        ? "warning"
        : "error";
    diagnostics.push({
      code,
      severity,
      message,
      skillFile: input.skillFile,
    });
  };

  Object.keys(frontmatter)
    .filter((field) => !ALLOWED_TOP_LEVEL_FIELDS.has(field))
    .sort(compareUtf8)
    .forEach((field) => {
      addError(
        "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
        `Unknown Agent Skills top-level field "${field}".`,
      );
    });

  const hasName = Object.hasOwn(frontmatter, "name");
  const name = frontmatter.name;
  if (!hasName) {
    addError("SKILL_NAME_REQUIRED", 'Agent Skills field "name" is required.');
  } else if (typeof name !== "string") {
    addError(
      "SKILL_NAME_NOT_STRING",
      'Agent Skills field "name" must be a string.',
    );
  } else {
    if (characterCount(name) > 64) {
      addError(
        "SKILL_NAME_TOO_LONG",
        'Agent Skills field "name" must contain at most 64 characters.',
      );
    }
    if (!AGENT_SKILL_NAME_PATTERN.test(name)) {
      addError(
        "SKILL_NAME_INVALID_FORMAT",
        'Agent Skills field "name" must contain only lowercase ASCII letters, digits, and single hyphens between segments.',
      );
    }
    if (name !== input.directoryName) {
      addError(
        "SKILL_NAME_DIRECTORY_MISMATCH",
        `Agent Skills name "${name}" must match directory "${input.directoryName}".`,
      );
    }
  }

  const hasDescription = Object.hasOwn(frontmatter, "description");
  const description = frontmatter.description;
  if (!hasDescription) {
    addError(
      "SKILL_DESCRIPTION_REQUIRED",
      'Agent Skills field "description" is required.',
    );
  } else if (typeof description !== "string") {
    addError(
      "SKILL_DESCRIPTION_NOT_STRING",
      'Agent Skills field "description" must be a string.',
    );
  } else if (description.trim() === "") {
    addError(
      "SKILL_DESCRIPTION_EMPTY",
      'Agent Skills field "description" must not be empty.',
    );
  } else if (characterCount(description) > 1_024) {
    addError(
      "SKILL_DESCRIPTION_TOO_LONG",
      'Agent Skills field "description" must contain at most 1024 characters.',
    );
  }

  const license = frontmatter.license;
  if (Object.hasOwn(frontmatter, "license")) {
    if (typeof license !== "string") {
      addError(
        "SKILL_LICENSE_NOT_STRING",
        'Agent Skills field "license" must be a string.',
      );
    } else if (license.trim() === "") {
      addError(
        "SKILL_LICENSE_EMPTY",
        'Agent Skills field "license" must not be empty.',
      );
    }
  }

  const compatibility = frontmatter.compatibility;
  if (Object.hasOwn(frontmatter, "compatibility")) {
    if (typeof compatibility !== "string") {
      addError(
        "SKILL_COMPATIBILITY_NOT_STRING",
        'Agent Skills field "compatibility" must be a string.',
      );
    } else if (compatibility.trim() === "") {
      addError(
        "SKILL_COMPATIBILITY_EMPTY",
        'Agent Skills field "compatibility" must not be empty.',
      );
    } else if (characterCount(compatibility) > 500) {
      addError(
        "SKILL_COMPATIBILITY_TOO_LONG",
        'Agent Skills field "compatibility" must contain at most 500 characters.',
      );
    }
  }

  const metadata: Record<string, string> = {};
  if (Object.hasOwn(frontmatter, "metadata")) {
    const metadataValue = frontmatter.metadata;
    if (!isMapping(metadataValue)) {
      addError(
        "SKILL_METADATA_NOT_MAPPING",
        'Agent Skills field "metadata" must be a string-to-string mapping.',
      );
    } else {
      const metadataNode = document.get("metadata", true);
      if (isMap(metadataNode)) {
        metadataNode.items
          .filter(
            (pair) =>
              !isScalar(pair.key) || typeof pair.key.value !== "string",
          )
          .map((pair) =>
            isScalar(pair.key) ? String(pair.key.value) : String(pair.key),
          )
          .sort(compareUtf8)
          .forEach((key) => {
            addError(
              "SKILL_METADATA_KEY_NOT_STRING",
              `Agent Skills metadata key "${key}" must be a string.`,
            );
          });
      }
      Object.keys(metadataValue)
        .sort(compareUtf8)
        .forEach((key) => {
          const value = metadataValue[key];
          if (typeof value !== "string") {
            addError(
              "SKILL_METADATA_VALUE_NOT_STRING",
              `Agent Skills metadata value for "${key}" must be a string.`,
            );
          } else {
            metadata[key] = value;
          }
        });
    }
  }

  const allowedToolsValue = frontmatter["allowed-tools"];
  let allowedTools: string[] = [];
  if (Object.hasOwn(frontmatter, "allowed-tools")) {
    if (typeof allowedToolsValue !== "string") {
      addError(
        "SKILL_ALLOWED_TOOLS_NOT_STRING",
        'Agent Skills field "allowed-tools" must be a space-delimited string.',
      );
    } else if (allowedToolsValue.trim() === "") {
      addError(
        "SKILL_ALLOWED_TOOLS_EMPTY",
        'Agent Skills field "allowed-tools" must not be empty.',
      );
    } else if (allowedToolsValue.includes(",")) {
      addError(
        "SKILL_ALLOWED_TOOLS_NOT_SPACE_DELIMITED",
        'Agent Skills field "allowed-tools" must use spaces, not commas, between tool names.',
      );
      if (input.mode === "compat") {
        allowedTools = allowedToolsValue
          .split(/[\s,]+/)
          .map((tool) => tool.trim())
          .filter(Boolean);
      }
    } else {
      allowedTools = allowedToolsValue.trim().split(/\s+/);
    }
  }

  if (diagnostics.some(({ severity }) => severity === "error")) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    skill: {
      name: name as string,
      description: description as string,
      ...(typeof license === "string" ? { license } : {}),
      ...(typeof compatibility === "string" ? { compatibility } : {}),
      metadata,
      allowedTools,
      body: trimSurroundingBlankLines(lines.slice(closingIndex + 1).join("\n")),
    },
    diagnostics,
  };
}
