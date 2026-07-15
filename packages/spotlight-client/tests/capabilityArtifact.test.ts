import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import { describe, expect, it } from "vitest";

import {
  buildCapabilityArtifactV1,
  canonicalizeJson,
  computeArtifactDigestV1,
  type CanonicalSkillInputV1,
} from "../src/node/index.js";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

function tool(
  name: string,
  version = "1.0.0",
  inputSchema: Record<string, unknown> = { type: "object" },
): FrontendToolDescriptorV1 {
  return {
    name,
    version,
    description: `Execute ${name}`,
    inputSchema,
    sideEffect: "ui",
    replayPolicy: "never",
  };
}

function parseTarFiles(tar: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= tar.byteLength) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const readString = (start: number, length: number): string => {
      const field = header.subarray(start, start + length);
      const nul = field.indexOf(0);
      return decode(nul >= 0 ? field.subarray(0, nul) : field);
    };
    const name = readString(0, 100);
    const prefix = readString(345, 155);
    const path = prefix ? `${prefix}/${name}` : name;
    const sizeText = readString(124, 12).trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    const bodyStart = offset + 512;
    if (String.fromCharCode(header[156] ?? 0) === "0") {
      files.set(path, tar.slice(bodyStart, bodyStart + size));
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function cameraFixture() {
  return {
    skills: [
      {
        name: "monitoring",
        files: [
          { relativePath: "SKILL.md", bytes: encode("# Monitoring\nOpen cameras.") },
          { relativePath: "references/cameras.json", bytes: encode('{"camera":1}') },
        ],
      },
    ] satisfies CanonicalSkillInputV1[],
    tools: [
      tool("video.open", "1.0.0", {
        required: ["channelId"],
        properties: { channelId: { type: "string" } },
        type: "object",
      }),
    ],
  };
}

describe("buildCapabilityArtifactV1", () => {
  it("builds a complete archive whose logical digests can be recomputed", () => {
    const result = buildCapabilityArtifactV1(cameraFixture());
    const files = parseTarFiles(Uint8Array.from(gunzipSync(result.archive)));

    expect([...files.keys()]).toEqual([
      "manifest.json",
      "skills/monitoring/SKILL.md",
      "skills/monitoring/references/cameras.json",
      "tool-manifest.json",
    ]);
    expect(result.artifactVersion).toBe("spotlight.capability-artifact/1");
    expect(result.byteLength).toBe(result.archive.byteLength);

    const manifestBytes = files.get("manifest.json")!;
    const toolManifestBytes = files.get("tool-manifest.json")!;
    const manifest = JSON.parse(decode(manifestBytes)) as {
      files: Array<{
        path: string;
        sha256: string;
        byteLength: number;
        mediaType: string;
      }>;
    };

    expect(manifestBytes).toEqual(canonicalizeJson(manifest));
    expect(toolManifestBytes).toEqual(
      canonicalizeJson(JSON.parse(decode(toolManifestBytes))),
    );
    expect(result.manifestDigest).toBe(sha256(manifestBytes));
    expect(result.toolManifestDigest).toBe(sha256(toolManifestBytes));

    for (const record of manifest.files) {
      const bytes = files.get(record.path)!;
      expect(record.byteLength).toBe(bytes.byteLength);
      expect(record.sha256).toBe(sha256(bytes));
    }
    expect(result.artifactDigest).toBe(
      computeArtifactDigestV1({
        manifestDigest: result.manifestDigest,
        toolManifestDigest: result.toolManifestDigest,
        payloads: manifest.files,
      }),
    );
    expect(result.archive.byteLength).toBe(716);
    expect(createHash("sha256").update(result.archive).digest("hex")).toBe(
      "a8721a7a84f8385050ad70da5e91aa5a7901d3e7d3b6858f323a2af8bfe8e839",
    );
  });

  it("is invariant to all approved input-order perturbations", () => {
    const firstInput = cameraFixture();
    firstInput.skills.push({
      name: "inspection",
      files: [
        { relativePath: "SKILL.md", bytes: encode("# Inspection") },
        { relativePath: "assets/config.yaml", bytes: encode("enabled: true") },
      ],
    });
    firstInput.tools.push(tool("camera.get"));

    const secondInput = {
      skills: [...firstInput.skills]
        .reverse()
        .map((skill) => ({ ...skill, files: [...skill.files].reverse() })),
      tools: [
        {
          replayPolicy: "never",
          sideEffect: "ui",
          inputSchema: { type: "object" },
          description: "Execute camera.get",
          version: "1.0.0",
          name: "camera.get",
        } satisfies FrontendToolDescriptorV1,
        {
          replayPolicy: "never",
          sideEffect: "ui",
          inputSchema: {
            type: "object",
            properties: { channelId: { type: "string" } },
            required: ["channelId"],
          },
          description: "Execute video.open",
          version: "1.0.0",
          name: "video.open",
        } satisfies FrontendToolDescriptorV1,
      ],
    };

    const first = buildCapabilityArtifactV1(firstInput);
    const second = buildCapabilityArtifactV1(secondInput);
    expect(second.manifestDigest).toBe(first.manifestDigest);
    expect(second.toolManifestDigest).toBe(first.toolManifestDigest);
    expect(second.artifactDigest).toBe(first.artifactDigest);
    expect(second.archive).toEqual(first.archive);
  });

  it("changes logical identity for payload and descriptor semantic changes", () => {
    const base = cameraFixture();
    const original = buildCapabilityArtifactV1(base);
    const payloadChanged = buildCapabilityArtifactV1({
      ...base,
      skills: [
        {
          ...base.skills[0]!,
          files: [{ relativePath: "SKILL.md", bytes: encode("changed") }],
        },
      ],
    });
    const descriptorChanged = buildCapabilityArtifactV1({
      ...base,
      tools: [
        {
          ...base.tools[0]!,
          description: "A semantically changed description",
        },
      ],
    });

    expect(payloadChanged.artifactDigest).not.toBe(original.artifactDigest);
    expect(descriptorChanged.artifactDigest).not.toBe(original.artifactDigest);
  });

  it("reproduces a 50 Skill, 100 Tool, 20 MiB fixture byte-for-byte", () => {
    const bytesPerSkill = Math.ceil((20 * 1024 * 1024) / 50);
    const skills = Array.from({ length: 50 }, (_, index) => ({
      name: `skill-${String(index).padStart(2, "0")}`,
      files: [
        {
          relativePath: "payload.bin",
          bytes: new Uint8Array(bytesPerSkill).fill(index),
        },
      ],
    }));
    const tools = Array.from({ length: 100 }, (_, index) =>
      tool(`tool.${String(index).padStart(3, "0")}`),
    );

    const first = buildCapabilityArtifactV1({ skills, tools });
    const second = buildCapabilityArtifactV1({
      skills: [...skills].reverse(),
      tools: [...tools].reverse(),
    });
    expect(first.archive).toEqual(second.archive);
    expect(first.artifactDigest).toBe(second.artifactDigest);
    expect(first.archive.byteLength).toBeGreaterThan(0);
  });
});
