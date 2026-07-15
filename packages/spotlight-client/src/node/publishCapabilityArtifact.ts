import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityArtifactAttestationV1 } from "@inupedia/spotlight-protocol";
import type { CapabilityArtifactBuildV1 } from "./capabilities/capabilityArtifact.js";
import { canonicalizeJson } from "./capabilities/canonicalJson.js";

export async function publishCapabilityArtifactV1(input: {
  outDir: string;
  projectId: string;
  frontendBuildId: string;
  build: CapabilityArtifactBuildV1;
  createdAt?: string;
}): Promise<{ artifactPath: string; attestationPath: string }> {
  await mkdir(input.outDir, { recursive: true });
  const artifactPath = join(input.outDir, `${input.build.artifactDigest}.tgz`);
  const attestationPath = join(input.outDir, "capability-attestation.json");
  const artifact = {
    digest: input.build.artifactDigest,
    manifestDigest: input.build.manifestDigest,
    skillManifestDigest: input.build.skillManifestDigest,
    toolManifestDigest: input.build.toolManifestDigest,
    byteLength: input.build.byteLength,
  };
  const attestation: CapabilityArtifactAttestationV1 = {
    schemaVersion: "spotlight.capability-attestation/1",
    projectId: input.projectId,
    frontendBuildId: input.frontendBuildId,
    artifact,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  await writeFile(artifactPath, input.build.archive, { flag: "wx" });
  await writeFile(attestationPath, `${new TextDecoder().decode(canonicalizeJson(attestation))}\n`, { flag: "wx", encoding: "utf8" });
  return { artifactPath, attestationPath };
}
