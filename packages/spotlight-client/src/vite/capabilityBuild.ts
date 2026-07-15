import { resolve, sep } from "node:path";
import { isProxy } from "node:util/types";

import {
  buildCapabilityArtifactV1,
  buildToolManifestV1,
  CapabilityArtifactError,
  loadCanonicalSkillsV1,
  scanProjectSkills,
  type AgentSkillDiagnostic,
  type SkillScanDiagnostic,
} from "../node/index.js";
import { validateSkillContent } from "../node/capabilities/skillFileValidator.js";
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
  const validation = await Promise.all(
    scan.skills.map(async (skill) => {
      const loadedSkill = loadedByName.get(skill.name);
      if (!loadedSkill) {
        invalidInput(`Loaded Skill snapshot is missing ${skill.name}`);
      }
      const skillFile = loadedSkill.files.find(
        (file) => file.relativePath === "SKILL.md",
      );
      if (!skillFile) {
        invalidInput(`Loaded Skill ${skill.name} is missing SKILL.md`);
      }
      const files = new Map(
        loadedSkill.files.map(
          (file) => [file.relativePath, file.bytes] as const,
        ),
      );
      return validateSkillContent({
        skill,
        markdown: Buffer.from(skillFile.bytes).toString("utf8"),
        mode,
        skillRoot: resolve(input.root, skill.directory),
        async readReference(relativePath) {
          const snapshotPath = relativePath.split(sep).join("/");
          return files.get(snapshotPath);
        },
      });
    }),
  );
  const diagnostics: Array<SkillScanDiagnostic | AgentSkillDiagnostic> = [
    ...scan.diagnostics,
    ...validation.flatMap((result) => result.diagnostics),
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
