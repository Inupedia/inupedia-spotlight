import { canonicalizeJson } from "../node/capabilities/canonicalJson.js";
import type { CapabilityBuildInfoV1 } from "./capabilityBuildTypes.js";

export const SPOTLIGHT_CAPABILITIES_MODULE_ID =
  "virtual:spotlight/capabilities" as const;
export const RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID =
  "\0virtual:spotlight/capabilities" as const;

export interface CapabilityVirtualModuleV1 {
  canonicalBuildInfoJson: string;
  source: string;
}

function disabledProviderSource(): string {
  return `export async function openUploadStream() {
    const error = new Error("Runtime capability Artifact upload is disabled.");
    Object.defineProperty(error, "code", {
      value: "ARTIFACT_RUNTIME_UPLOAD_DISABLED",
      enumerable: true,
    });
    throw error;
  }`;
}

function developmentProviderSource(
  buildInfo: Readonly<CapabilityBuildInfoV1>,
): string {
  const digest = JSON.stringify(buildInfo.artifactDigest);
  const path = JSON.stringify(
    `/@spotlight/capability-artifacts/${buildInfo.artifactDigest}`,
  );
  return `export async function openUploadStream() {
    const response = await fetch(${path}, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error("Unable to open capability Artifact stream.");
    }
    if (response.body == null) {
      throw new Error("Capability Artifact response has no stream body.");
    }
    return {
      digest: ${digest},
      byteLength: capabilityBuildInfo.byteLength,
      contentType: "application/gzip",
      stream: response.body,
    };
  }`;
}

export function buildCapabilityVirtualModuleV1(
  buildInfo: Readonly<CapabilityBuildInfoV1>,
  options: Readonly<{ runtimeUpload?: boolean }> = {},
): Readonly<CapabilityVirtualModuleV1> {
  const canonicalBuildInfoJson = new TextDecoder().decode(
    canonicalizeJson(buildInfo),
  );
  return Object.freeze({
    canonicalBuildInfoJson,
    source: `export const capabilityBuildInfo = Object.freeze(${canonicalBuildInfoJson});\n\n${options.runtimeUpload === true ? developmentProviderSource(buildInfo) : disabledProviderSource()}\n`,
  });
}
