import {
  buildCapabilityFileMapV1,
  computeArtifactDigestV1,
} from "./capabilityFileMap.js";
import type { CapabilityArtifactInputV1 } from "./capabilityArtifactTypes.js";
import { encodeDeterministicGzipV1 } from "./deterministicGzip.js";
import { encodeDeterministicUstarV1 } from "./deterministicTar.js";
import { buildSkillManifestV1 } from "./skillManifest.js";
import { buildToolManifestV1 } from "./toolManifest.js";

export interface CapabilityArtifactBuildV1 {
  artifactVersion: "spotlight.capability-artifact/1";
  artifactDigest: string;
  manifestDigest: string;
  skillManifestDigest: string;
  toolManifestDigest: string;
  byteLength: number;
  archive: Uint8Array;
  manifestBytes: Uint8Array;
  skillManifestBytes: Uint8Array;
  toolManifestBytes: Uint8Array;
}

export function buildCapabilityArtifactV1(
  input: CapabilityArtifactInputV1,
): CapabilityArtifactBuildV1 {
  const toolManifest = buildToolManifestV1(input.tools);
  const skillManifest = buildSkillManifestV1(input.skills);
  const fileMap = buildCapabilityFileMapV1({
    skills: input.skills,
    skillManifestBytes: skillManifest.bytes,
    toolManifestBytes: toolManifest.bytes,
  });
  const artifactDigest = computeArtifactDigestV1({
    manifestDigest: fileMap.manifestDigest,
    skillManifestDigest: skillManifest.digest,
    toolManifestDigest: toolManifest.digest,
    payloads: fileMap.payloads,
  });
  const tar = encodeDeterministicUstarV1([
    { path: "manifest.json", bytes: fileMap.manifestBytes },
    ...fileMap.payloads.map(({ path, bytes }) => ({ path, bytes })),
  ]);
  const archive = encodeDeterministicGzipV1(tar);

  return {
    artifactVersion: "spotlight.capability-artifact/1",
    artifactDigest,
    manifestDigest: fileMap.manifestDigest,
    skillManifestDigest: skillManifest.digest,
    toolManifestDigest: toolManifest.digest,
    byteLength: archive.byteLength,
    archive,
    manifestBytes: Uint8Array.from(fileMap.manifestBytes),
    skillManifestBytes: Uint8Array.from(skillManifest.bytes),
    toolManifestBytes: Uint8Array.from(toolManifest.bytes),
  };
}
