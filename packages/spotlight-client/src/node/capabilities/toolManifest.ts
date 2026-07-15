import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";

import { canonicalizeJson, compareUtf16 } from "./canonicalJson.js";
import { CapabilityArtifactError } from "./capabilityArtifactError.js";

export interface ToolManifestV1 {
  schemaVersion: "spotlight.tool-manifest/1";
  tools: FrontendToolDescriptorV1[];
}

export interface BuiltToolManifestV1 {
  manifest: ToolManifestV1;
  bytes: Uint8Array;
  digest: string;
}

const TOOL_FIELDS = new Set([
  "name",
  "version",
  "description",
  "inputSchema",
  "outputSchema",
  "maxOutputBytes",
  "sideEffect",
  "replayPolicy",
  "riskLevel",
  "requiresConfirmation",
]);
const SIDE_EFFECTS = new Set(["none", "ui", "external"]);
const REPLAY_POLICIES = new Set(["safe", "idempotency-key", "never"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function compareTools(
  left: FrontendToolDescriptorV1,
  right: FrontendToolDescriptorV1,
): number {
  return compareUtf16(left.name, right.name) || compareUtf16(left.version, right.version);
}

function invalidTool(message: string): never {
  throw new CapabilityArtifactError("ARTIFACT_TOOL_INVALID", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateToolDescriptor(
  value: unknown,
): asserts value is FrontendToolDescriptorV1 {
  canonicalizeJson(value);
  if (!isPlainObject(value)) {
    invalidTool("Tool descriptor must be a plain JSON object");
  }

  const unknownFields = Object.keys(value)
    .filter((field) => !TOOL_FIELDS.has(field))
    .sort(compareUtf16);
  if (unknownFields.length > 0) {
    invalidTool(`Unknown Tool descriptor fields: ${unknownFields.join(", ")}`);
  }

  const tool = value as Partial<FrontendToolDescriptorV1>;
  if (typeof tool.name !== "string" || tool.name.trim().length === 0) {
    invalidTool("Tool name must be a non-empty string");
  }
  if (typeof tool.version !== "string" || tool.version.trim().length === 0) {
    invalidTool(`Tool ${tool.name} version must be a non-empty string`);
  }
  if (
    typeof tool.description !== "string" ||
    tool.description.trim().length === 0
  ) {
    invalidTool(`Tool ${tool.name} description must be a non-empty string`);
  }
  if (!isPlainObject(tool.inputSchema)) {
    invalidTool(`Tool ${tool.name} inputSchema must be a JSON object`);
  }
  if (tool.outputSchema !== undefined && !isPlainObject(tool.outputSchema)) {
    invalidTool(`Tool ${tool.name} outputSchema must be a JSON object`);
  }
  if (
    tool.maxOutputBytes !== undefined &&
    (!Number.isSafeInteger(tool.maxOutputBytes) || tool.maxOutputBytes <= 0)
  ) {
    invalidTool(`Tool ${tool.name} maxOutputBytes must be a positive safe integer`);
  }
  if (typeof tool.sideEffect !== "string" || !SIDE_EFFECTS.has(tool.sideEffect)) {
    invalidTool(`Tool ${tool.name} has an invalid sideEffect`);
  }
  if (
    typeof tool.replayPolicy !== "string" ||
    !REPLAY_POLICIES.has(tool.replayPolicy)
  ) {
    invalidTool(`Tool ${tool.name} has an invalid replayPolicy`);
  }
  if (
    tool.riskLevel !== undefined &&
    (typeof tool.riskLevel !== "string" || !RISK_LEVELS.has(tool.riskLevel))
  ) {
    invalidTool(`Tool ${tool.name} has an invalid riskLevel`);
  }
  if (
    tool.requiresConfirmation !== undefined &&
    typeof tool.requiresConfirmation !== "boolean"
  ) {
    invalidTool(`Tool ${tool.name} requiresConfirmation must be boolean`);
  }
}

export function buildToolManifestV1(
  tools: FrontendToolDescriptorV1[],
): BuiltToolManifestV1 {
  if (isProxy(tools) || !Array.isArray(tools)) {
    invalidTool("Tool collection must be an array");
  }
  canonicalizeJson(tools);
  for (const tool of tools) validateToolDescriptor(tool);

  const sortedTools = [...tools].sort(compareTools);
  for (let index = 1; index < sortedTools.length; index += 1) {
    const previous = sortedTools[index - 1];
    const current = sortedTools[index];
    if (
      previous?.name === current?.name &&
      previous.version === current.version
    ) {
      throw new CapabilityArtifactError(
        "ARTIFACT_TOOL_DUPLICATE",
        `Duplicate Tool identity: ${current.name}@${current.version}`,
      );
    }
  }

  const candidate: ToolManifestV1 = {
    schemaVersion: "spotlight.tool-manifest/1",
    tools: sortedTools,
  };
  const bytes = canonicalizeJson(candidate);
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as ToolManifestV1;

  return {
    manifest,
    bytes,
    digest: sha256(bytes),
  };
}
