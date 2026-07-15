import { createHash } from "node:crypto";

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

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function compareTools(
  left: FrontendToolDescriptorV1,
  right: FrontendToolDescriptorV1,
): number {
  return compareUtf16(left.name, right.name) || compareUtf16(left.version, right.version);
}

function validateToolIdentity(tool: FrontendToolDescriptorV1): void {
  if (typeof tool.name !== "string" || tool.name.trim().length === 0) {
    throw new CapabilityArtifactError(
      "ARTIFACT_TOOL_INVALID",
      "Tool name must be a non-empty string",
    );
  }
  if (typeof tool.version !== "string" || tool.version.trim().length === 0) {
    throw new CapabilityArtifactError(
      "ARTIFACT_TOOL_INVALID",
      `Tool ${tool.name} version must be a non-empty string`,
    );
  }
}

export function buildToolManifestV1(
  tools: FrontendToolDescriptorV1[],
): BuiltToolManifestV1 {
  for (const tool of tools) validateToolIdentity(tool);

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
