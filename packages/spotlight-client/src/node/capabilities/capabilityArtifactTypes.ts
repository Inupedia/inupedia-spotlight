import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";

export interface CanonicalSkillFileInputV1 {
  relativePath: string;
  bytes: Uint8Array;
  mediaType?: string;
}

export interface CanonicalSkillInputV1 {
  name: string;
  files: CanonicalSkillFileInputV1[];
}

export interface CapabilityArtifactInputV1 {
  skills: CanonicalSkillInputV1[];
  tools: FrontendToolDescriptorV1[];
}

export interface CapabilityPayloadFileV1 {
  path: string;
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
  mediaType: string;
}

export interface CapabilityFileManifestEntryV1 {
  path: string;
  sha256: string;
  byteLength: number;
  mediaType: string;
}

export interface CapabilityFileManifestV1 {
  schemaVersion: "spotlight.capability-manifest/1";
  files: CapabilityFileManifestEntryV1[];
}
