import { sep } from "node:path";
import { isProxy } from "node:util/types";

import {
  buildCapabilityArtifactV1,
  buildToolManifestV1,
  CapabilityArtifactError,
  loadCanonicalSkillsV1,
  scanProjectSkills,
  validateAgentSkillMarkdown,
  type AgentSkillDiagnostic,
  type CanonicalSkillInputV1,
  type ScannedSkill,
  type SkillScanDiagnostic,
} from "../node/index.js";
import type {
  CapabilityBuildInfoV1,
  CapabilityPluginBuildResultV1,
  SpotlightCapabilitiesOptionsV1,
  SpotlightCapabilityProjectBuildV1,
} from "./capabilityBuildTypes.js";

export type {
  CapabilityBuildInfoV1,
  CapabilityPluginBuildResultV1,
  SpotlightCapabilitiesOptionsV1,
  SpotlightCapabilityProjectBuildV1,
} from "./capabilityBuildTypes.js";

const PROJECT_FIELDS = new Set(["projectId", "tools"]);
const MAX_REFERENCE_BYTES = 1024 * 1024;
const MARKDOWN_LINK_PATTERN =
  /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
const URI_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

function invalidInput(message: string): never {
  throw new CapabilityArtifactError("ARTIFACT_INPUT_INVALID", message);
}

function validateProject(
  value: unknown,
): SpotlightCapabilityProjectBuildV1 {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value)
  ) {
    invalidInput("Capability project must be a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidInput("Capability project must be a plain object");
  }

  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== PROJECT_FIELDS.size ||
    keys.some(
      (key) => typeof key !== "string" || !PROJECT_FIELDS.has(key),
    )
  ) {
    invalidInput("Capability project own fields must be exactly projectId and tools");
  }

  const readDataField = (field: "projectId" | "tools"): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      invalidInput(
        `Capability project field ${field} must be an enumerable data property`,
      );
    }
    return descriptor.value;
  };
  const projectId = readDataField("projectId");
  const tools = readDataField("tools");
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    invalidInput("Capability projectId must be a non-empty string");
  }

  return {
    projectId,
    tools: tools as SpotlightCapabilityProjectBuildV1["tools"],
  };
}

function throwDiagnostic(
  diagnostic: SkillScanDiagnostic | AgentSkillDiagnostic,
): never {
  const message =
    "message" in diagnostic
      ? diagnostic.message
      : `Skill scan failed with ${diagnostic.code}`;
  throw Object.assign(new Error(message), diagnostic);
}

function freezeDiagnostic(
  diagnostic: SkillScanDiagnostic | AgentSkillDiagnostic,
): SkillScanDiagnostic | AgentSkillDiagnostic {
  if ("candidates" in diagnostic) {
    const candidates = [...diagnostic.candidates];
    Object.freeze(candidates);
    return Object.freeze({
      code: diagnostic.code,
      severity: diagnostic.severity,
      name: diagnostic.name,
      ...(diagnostic.selected === undefined
        ? {}
        : { selected: diagnostic.selected }),
      candidates,
    });
  }
  return Object.freeze({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    skillFile: diagnostic.skillFile,
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(
    Buffer.from(left, "utf8"),
    Buffer.from(right, "utf8"),
  );
}

function extractRelativeMarkdownLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const destination = match[1];
    if (
      !destination ||
      destination.startsWith("#") ||
      destination.startsWith("/") ||
      URI_SCHEME_PATTERN.test(destination)
    ) {
      continue;
    }
    const path = destination.split(/[?#]/, 1)[0];
    if (path?.toLowerCase().endsWith(".md")) links.add(path);
  }
  return [...links].sort(compareUtf8);
}

function normalizeSnapshotPath(path: string): string | undefined {
  const segments: string[] = [];
  const portablePath = sep === "\\" ? path.replaceAll("\\", "/") : path;
  for (const segment of portablePath.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function skillWarning(
  skill: ScannedSkill,
  code: AgentSkillDiagnostic["code"],
  message: string,
): AgentSkillDiagnostic {
  return { code, severity: "warning", message, skillFile: skill.skillFile };
}

function validateLoadedSkillSnapshot(input: {
  skill: ScannedSkill;
  loaded: CanonicalSkillInputV1;
  mode: "strict" | "compat";
}): AgentSkillDiagnostic[] {
  const skillFile = input.loaded.files.find(
    (file) => file.relativePath === "SKILL.md",
  );
  if (!skillFile) {
    invalidInput(`Loaded Skill ${input.skill.name} is missing SKILL.md`);
  }
  const markdown = Buffer.from(skillFile.bytes)
    .toString("utf8")
    .replace(/\r\n?/g, "\n");
  const result = validateAgentSkillMarkdown({
    directoryName: input.skill.name,
    skillFile: input.skill.skillFile,
    markdown,
    mode: input.mode,
  });
  const diagnostics = [...result.diagnostics];
  const lineCount = markdown.split("\n").length;
  const estimatedTokens = Math.ceil(markdown.length / 4);
  if (lineCount > 500) {
    diagnostics.push(
      skillWarning(
        input.skill,
        "SKILL_RECOMMENDATION_LINES",
        `SKILL.md contains ${lineCount} lines; the Agent Skills recommendation is at most 500.`,
      ),
    );
  }
  if (estimatedTokens > 5_000) {
    diagnostics.push(
      skillWarning(
        input.skill,
        "SKILL_RECOMMENDATION_TOKENS",
        `SKILL.md has a deterministic estimate of ${estimatedTokens} tokens; the recommendation is at most 5000.`,
      ),
    );
  }

  const files = new Map(
    input.loaded.files.map((file) => [file.relativePath, file.bytes] as const),
  );
  for (const link of extractRelativeMarkdownLinks(markdown)) {
    const target = normalizeSnapshotPath(link);
    if (target === undefined) {
      diagnostics.push(
        skillWarning(
          input.skill,
          "SKILL_REFERENCE_OUTSIDE_ROOT",
          `Markdown reference "${link}" resolves outside the Skill root.`,
        ),
      );
      continue;
    }
    const referencedBytes = files.get(target);
    if (
      referencedBytes === undefined ||
      referencedBytes.byteLength > MAX_REFERENCE_BYTES
    ) {
      continue;
    }
    const referencedMarkdown = Buffer.from(referencedBytes).toString("utf8");
    if (extractRelativeMarkdownLinks(referencedMarkdown).length > 0) {
      diagnostics.push(
        skillWarning(
          input.skill,
          "SKILL_REFERENCE_CHAIN_DEEP",
          `Markdown reference "${link}" links to another Markdown reference.`,
        ),
      );
    }
  }
  return diagnostics;
}

export async function buildViteCapabilitiesV1(input: {
  root: string;
  command: "serve" | "build";
  project: SpotlightCapabilityProjectBuildV1;
  options?: SpotlightCapabilitiesOptionsV1;
}): Promise<CapabilityPluginBuildResultV1> {
  const project = validateProject(input.project);
  const toolManifest = buildToolManifestV1(
    project.tools as FrontendToolDescriptorArray,
  );
  const frontendBuildId = input.options?.frontendBuildId;
  if (
    input.command === "build" &&
    (frontendBuildId === undefined || frontendBuildId.trim().length === 0)
  ) {
    invalidInput("Production capability builds require frontendBuildId");
  }

  const mode = input.command === "build" ? "strict" : "compat";
  const scan = await scanProjectSkills({
    projectRoot: input.root,
    mode,
    skillRoots: input.options?.skillRoots,
  });
  const scanErrorDiagnostic = scan.diagnostics.find(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (scanErrorDiagnostic) throwDiagnostic(scanErrorDiagnostic);

  const loaded = await loadCanonicalSkillsV1({
    projectRoot: input.root,
    skills: scan.skills,
  });
  const loadedByName = new Map(
    loaded.skills.map((skill) => [skill.name, skill] as const),
  );
  const validation = scan.skills.map((skill) => {
    const loadedSkill = loadedByName.get(skill.name);
    if (!loadedSkill) {
      invalidInput(`Loaded Skill snapshot is missing ${skill.name}`);
    }
    return validateLoadedSkillSnapshot({ skill, loaded: loadedSkill, mode });
  });
  const diagnostics: Array<SkillScanDiagnostic | AgentSkillDiagnostic> = [
    ...scan.diagnostics,
    ...validation.flat(),
  ].map(freezeDiagnostic);
  const errorDiagnostic = diagnostics.find(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errorDiagnostic) throwDiagnostic(errorDiagnostic);

  const artifact = buildCapabilityArtifactV1({
    skills: loaded.skills,
    tools: toolManifest.manifest.tools,
  });
  const buildInfo: Readonly<CapabilityBuildInfoV1> = Object.freeze({
    schemaVersion: "spotlight.capability-build-info/1",
    projectId: project.projectId,
    frontendBuildId:
      input.command === "build"
        ? frontendBuildId!
        : `dev:${artifact.artifactDigest}`,
    artifactVersion: artifact.artifactVersion,
    artifactDigest: artifact.artifactDigest,
    manifestDigest: artifact.manifestDigest,
    toolManifestDigest: artifact.toolManifestDigest,
    byteLength: artifact.byteLength,
  });

  return {
    buildInfo,
    archive: artifact.archive,
    watchedFiles: Object.freeze([...loaded.watchedFiles]),
    diagnostics: Object.freeze([...diagnostics]),
  };
}

type FrontendToolDescriptorArray = Parameters<typeof buildToolManifestV1>[0];
