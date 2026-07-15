import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";

import type { SkillRootInput, SkillScanDiagnostic } from "../node/capabilities/skillScanner.js";
import type { AgentSkillDiagnostic } from "../node/capabilities/skillValidator.js";

export interface SpotlightCapabilityProjectBuildV1 {
  projectId: string;
  tools: readonly FrontendToolDescriptorV1[];
}

export interface SpotlightCapabilitiesOptionsV1 {
  skillRoots?: readonly SkillRootInput[];
  frontendBuildId?: string;
  devRuntimeUpload?: boolean;
}

export interface CapabilityBuildInfoV1 {
  schemaVersion: "spotlight.capability-build-info/1";
  projectId: string;
  frontendBuildId: string;
  artifactVersion: "spotlight.capability-artifact/1";
  artifactDigest: string;
  manifestDigest: string;
  toolManifestDigest: string;
  byteLength: number;
}

export interface CapabilityPluginBuildResultV1 {
  buildInfo: Readonly<CapabilityBuildInfoV1>;
  archive: Uint8Array;
  watchedFiles: readonly string[];
  diagnostics: readonly (SkillScanDiagnostic | AgentSkillDiagnostic)[];
}
