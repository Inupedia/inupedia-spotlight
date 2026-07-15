import { createHash } from "node:crypto";

import { canonicalizeJson, compareUtf16 } from "./canonicalJson.js";
import type { CanonicalSkillInputV1 } from "./capabilityArtifactTypes.js";

export interface CapabilitySkillManifestEntryV1 {
  name: string;
  entrypoint: string;
  files: string[];
}

export interface CapabilitySkillManifestV1 {
  schemaVersion: "spotlight.skill-manifest/1";
  skills: CapabilitySkillManifestEntryV1[];
}

export function buildSkillManifestV1(skills: CanonicalSkillInputV1[]) {
  const manifest: CapabilitySkillManifestV1 = {
    schemaVersion: "spotlight.skill-manifest/1",
    skills: skills
      .map((skill) => ({
        name: skill.name,
        entrypoint: `skills/${skill.name}/SKILL.md`,
        files: skill.files
          .map((file) => `skills/${skill.name}/${file.relativePath}`)
          .sort(compareUtf16),
      }))
      .sort((left, right) => compareUtf16(left.name, right.name)),
  };
  const bytes = canonicalizeJson(manifest);
  return {
    manifest: JSON.parse(new TextDecoder().decode(bytes)) as CapabilitySkillManifestV1,
    bytes,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}
