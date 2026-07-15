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

export function buildCapabilityVirtualModuleV1(
  buildInfo: Readonly<CapabilityBuildInfoV1>,
): Readonly<CapabilityVirtualModuleV1> {
  const canonicalBuildInfoJson = new TextDecoder().decode(
    canonicalizeJson(buildInfo),
  );
  return Object.freeze({
    canonicalBuildInfoJson,
    source: `export const capabilityBuildInfo = Object.freeze(${canonicalBuildInfoJson});\n\n${disabledProviderSource()}\n`,
  });
}
