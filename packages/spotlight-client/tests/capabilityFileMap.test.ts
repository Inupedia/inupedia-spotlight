import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalizeJson } from "../src/node/capabilities/canonicalJson.js";
import {
  buildCapabilityFileMapV1,
  computeArtifactDigestV1,
} from "../src/node/capabilities/capabilityFileMap.js";
import type { CanonicalSkillInputV1 } from "../src/node/capabilities/capabilityArtifactTypes.js";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

function skill(
  name: string,
  files: CanonicalSkillInputV1["files"],
): CanonicalSkillInputV1 {
  return { name, files };
}

function expectArtifactError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("buildCapabilityFileMapV1", () => {
  it("maps and sorts Tool and Skill payloads independently of input order", () => {
    const toolManifestBytes = encode('{"schemaVersion":"spotlight.tool-manifest/1","tools":[]}');
    const result = buildCapabilityFileMapV1({
      toolManifestBytes,
      skills: [
        skill("zeta", [
          { relativePath: "references/info.json", bytes: encode("{}") },
          { relativePath: "SKILL.md", bytes: encode("# Zeta") },
        ]),
        skill("alpha", [
          {
            relativePath: "assets/camera.bin",
            bytes: Uint8Array.from([0, 1, 2]),
            mediaType: "application/x-camera-fixture",
          },
          { relativePath: "SKILL.md", bytes: encode("# 监控") },
        ]),
      ],
    });

    expect(result.payloads.map(({ path }) => path)).toEqual([
      "skills/alpha/SKILL.md",
      "skills/alpha/assets/camera.bin",
      "skills/zeta/SKILL.md",
      "skills/zeta/references/info.json",
      "tool-manifest.json",
    ]);
    expect(result.manifest.files.map(({ path }) => path)).toEqual(
      result.payloads.map(({ path }) => path),
    );
    expect(result.manifest.files).not.toContainEqual(
      expect.objectContaining({ path: "manifest.json" }),
    );
    expect(result.manifest.files).toContainEqual(
      expect.objectContaining({
        path: "skills/alpha/SKILL.md",
        byteLength: encode("# 监控").byteLength,
        mediaType: "text/markdown; charset=utf-8",
      }),
    );
    expect(result.manifest.files).toContainEqual(
      expect.objectContaining({
        path: "skills/alpha/assets/camera.bin",
        mediaType: "application/x-camera-fixture",
      }),
    );
    expect(result.manifest.files).toContainEqual(
      expect.objectContaining({
        path: "skills/zeta/references/info.json",
        mediaType: "application/json",
      }),
    );
    expect(result.manifest.files).toContainEqual(
      expect.objectContaining({
        path: "tool-manifest.json",
        mediaType: "application/json",
      }),
    );
  });

  it("hashes raw payload bytes and exact canonical manifest bytes", () => {
    const result = buildCapabilityFileMapV1({
      toolManifestBytes: encode("{}"),
      skills: [skill("camera", [{ relativePath: "SKILL.md", bytes: encode("camera") }])],
    });

    for (const payload of result.payloads) {
      expect(payload.sha256).toBe(
        `sha256:${createHash("sha256").update(payload.bytes).digest("hex")}`,
      );
    }
    expect(result.manifestBytes).toEqual(canonicalizeJson(result.manifest));
    expect(result.manifestDigest).toBe(
      `sha256:${createHash("sha256").update(result.manifestBytes).digest("hex")}`,
    );
  });

  it("copies caller bytes before recording digests", () => {
    const source = encode("original");
    const result = buildCapabilityFileMapV1({
      toolManifestBytes: encode("{}"),
      skills: [skill("camera", [{ relativePath: "SKILL.md", bytes: source }])],
    });

    source.fill(0);
    const payload = result.payloads.find(({ path }) => path.endsWith("SKILL.md"));
    expect(decode(payload?.bytes ?? new Uint8Array())).toBe("original");
    expect(payload?.sha256).toBe(
      `sha256:${createHash("sha256").update("original").digest("hex")}`,
    );
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    const result = buildCapabilityFileMapV1({
      toolManifestBytes: encode("{}"),
      skills: [skill("camera", [{ relativePath: "assets/model.custom", bytes: encode("x") }])],
    });
    expect(result.manifest.files).toContainEqual(
      expect.objectContaining({
        path: "skills/camera/assets/model.custom",
        mediaType: "application/octet-stream",
      }),
    );
  });

  it.each([
    ["empty", ""],
    ["absolute", "/etc/passwd"],
    ["drive", "C:/secret.txt"],
    ["backslash", "references\\secret.md"],
    ["NUL", "references/secret\0.md"],
    ["dot", "references/./secret.md"],
    ["parent", "references/../secret.md"],
    ["empty segment", "references//secret.md"],
    ["trailing slash", "references/"],
  ])("rejects invalid relative paths: %s", (_label, relativePath) => {
    expectArtifactError(
      () =>
        buildCapabilityFileMapV1({
          toolManifestBytes: encode("{}"),
          skills: [skill("camera", [{ relativePath, bytes: encode("x") }])],
        }),
      "ARTIFACT_PATH_INVALID",
    );
  });

  it.each(["Camera", "camera_view", "camera--view", "camera.", "-camera"])(
    "rejects non-canonical Skill names: %s",
    (name) => {
      expectArtifactError(
        () =>
          buildCapabilityFileMapV1({
            toolManifestBytes: encode("{}"),
            skills: [skill(name, [{ relativePath: "SKILL.md", bytes: encode("x") }])],
          }),
        "ARTIFACT_PATH_INVALID",
      );
    },
  );

  it("rejects duplicate mapped archive paths", () => {
    expectArtifactError(
      () =>
        buildCapabilityFileMapV1({
          toolManifestBytes: encode("{}"),
          skills: [
            skill("camera", [{ relativePath: "SKILL.md", bytes: encode("first") }]),
            skill("camera", [{ relativePath: "SKILL.md", bytes: encode("second") }]),
          ],
        }),
      "ARTIFACT_PATH_DUPLICATE",
    );
  });

  it("uses UTF-8 byte limits for the USTAR name field", () => {
    expectArtifactError(
      () =>
        buildCapabilityFileMapV1({
          toolManifestBytes: encode("{}"),
          skills: [
            skill("camera", [
              { relativePath: `${"界".repeat(34)}.md`, bytes: encode("x") },
            ]),
          ],
        }),
      "ARTIFACT_PATH_USTAR_UNREPRESENTABLE",
    );
  });

  it("accepts a long path when USTAR prefix and name can represent it", () => {
    const nested = `${"segment/".repeat(12)}document.md`;
    const result = buildCapabilityFileMapV1({
      toolManifestBytes: encode("{}"),
      skills: [skill("camera", [{ relativePath: nested, bytes: encode("x") }])],
    });
    expect(result.payloads).toContainEqual(
      expect.objectContaining({ path: `skills/camera/${nested}` }),
    );
  });
});

describe("computeArtifactDigestV1", () => {
  const payloads = [
    { path: "tool-manifest.json", sha256: `sha256:${"a".repeat(64)}` },
    { path: "skills/camera/SKILL.md", sha256: `sha256:${"b".repeat(64)}` },
  ];

  it("hashes the approved logical preimage in defensive path order", () => {
    const input = {
      manifestDigest: `sha256:${"c".repeat(64)}`,
      toolManifestDigest: `sha256:${"d".repeat(64)}`,
      payloads,
    };
    const preimage = {
      artifactVersion: "spotlight.capability-artifact/1",
      manifestDigest: input.manifestDigest,
      payloadDigests: [...payloads].sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      ),
      toolManifestDigest: input.toolManifestDigest,
    };
    const expected = createHash("sha256")
      .update(canonicalizeJson(preimage))
      .digest("hex");

    expect(computeArtifactDigestV1(input)).toBe(`sha256:${expected}`);
    expect(
      computeArtifactDigestV1({ ...input, payloads: [...payloads].reverse() }),
    ).toBe(`sha256:${expected}`);
  });

  it("changes when any logical payload digest changes", () => {
    const base = computeArtifactDigestV1({
      manifestDigest: `sha256:${"c".repeat(64)}`,
      toolManifestDigest: `sha256:${"d".repeat(64)}`,
      payloads,
    });
    const changed = computeArtifactDigestV1({
      manifestDigest: `sha256:${"c".repeat(64)}`,
      toolManifestDigest: `sha256:${"d".repeat(64)}`,
      payloads: [{ ...payloads[0]!, sha256: `sha256:${"e".repeat(64)}` }, payloads[1]!],
    });
    expect(changed).not.toBe(base);
  });
});
