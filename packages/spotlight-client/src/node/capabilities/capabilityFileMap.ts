import { createHash } from "node:crypto";

import { canonicalizeJson, compareUtf16 } from "./canonicalJson.js";
import { CapabilityArtifactError } from "./capabilityArtifactError.js";
import type {
  CanonicalSkillInputV1,
  CapabilityFileManifestV1,
  CapabilityPayloadFileV1,
} from "./capabilityArtifactTypes.js";

const CANONICAL_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const textEncoder = new TextEncoder();

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/tsx; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
};

export interface BuiltCapabilityFileMapV1 {
  payloads: CapabilityPayloadFileV1[];
  manifest: CapabilityFileManifestV1;
  manifestBytes: Uint8Array;
  manifestDigest: string;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function canRepresentUstarPath(path: string): boolean {
  if (byteLength(path) <= 100) return true;
  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (name.length > 0 && byteLength(prefix) <= 155 && byteLength(name) <= 100) {
      return true;
    }
  }
  return false;
}

function validateSkillName(name: string): void {
  if (!CANONICAL_SKILL_NAME.test(name) || name.length > 64) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_INVALID",
      `Invalid canonical Skill name: ${name}`,
    );
  }
}

function validateRelativePath(relativePath: string): void {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:/.test(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    relativePath.endsWith("/")
  ) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_INVALID",
      `Invalid Skill relative path: ${relativePath}`,
    );
  }

  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_INVALID",
      `Invalid Skill relative path segment: ${relativePath}`,
    );
  }
}

function ensureUstarPath(path: string): void {
  if (!canRepresentUstarPath(path)) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_USTAR_UNREPRESENTABLE",
      `Path cannot be represented by POSIX USTAR: ${path}`,
    );
  }
}

function inferMediaType(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return MEDIA_TYPES[extension] ?? "application/octet-stream";
}

function createPayload(
  path: string,
  sourceBytes: Uint8Array,
  mediaType: string,
): CapabilityPayloadFileV1 {
  const bytes = Uint8Array.from(sourceBytes);
  if (!Number.isSafeInteger(bytes.byteLength)) {
    throw new CapabilityArtifactError(
      "ARTIFACT_SIZE_OVERFLOW",
      `Payload byte length exceeds safe integer range: ${path}`,
    );
  }
  return {
    path,
    bytes,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    mediaType,
  };
}

function addPayload(
  payloads: CapabilityPayloadFileV1[],
  seenPaths: Set<string>,
  payload: CapabilityPayloadFileV1,
): void {
  if (seenPaths.has(payload.path)) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_DUPLICATE",
      `Duplicate Artifact payload path: ${payload.path}`,
    );
  }
  seenPaths.add(payload.path);
  payloads.push(payload);
}

export function buildCapabilityFileMapV1(input: {
  skills: CanonicalSkillInputV1[];
  toolManifestBytes: Uint8Array;
}): BuiltCapabilityFileMapV1 {
  const payloads: CapabilityPayloadFileV1[] = [];
  const seenPaths = new Set<string>();

  addPayload(
    payloads,
    seenPaths,
    createPayload("tool-manifest.json", input.toolManifestBytes, "application/json"),
  );

  for (const skill of input.skills) {
    validateSkillName(skill.name);
    for (const file of skill.files) {
      validateRelativePath(file.relativePath);
      const path = `skills/${skill.name}/${file.relativePath}`;
      ensureUstarPath(path);
      addPayload(
        payloads,
        seenPaths,
        createPayload(path, file.bytes, file.mediaType ?? inferMediaType(path)),
      );
    }
  }

  payloads.sort((left, right) => compareUtf16(left.path, right.path));
  const candidate: CapabilityFileManifestV1 = {
    schemaVersion: "spotlight.capability-manifest/1",
    files: payloads.map(({ path, sha256: digest, byteLength: length, mediaType }) => ({
      path,
      sha256: digest,
      byteLength: length,
      mediaType,
    })),
  };
  const manifestBytes = canonicalizeJson(candidate);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as CapabilityFileManifestV1;

  return {
    payloads,
    manifest,
    manifestBytes,
    manifestDigest: sha256(manifestBytes),
  };
}

export function computeArtifactDigestV1(input: {
  manifestDigest: string;
  toolManifestDigest: string;
  payloads: Array<Pick<CapabilityPayloadFileV1, "path" | "sha256">>;
}): string {
  if (!SHA256_DIGEST.test(input.manifestDigest) || !SHA256_DIGEST.test(input.toolManifestDigest)) {
    throw new CapabilityArtifactError(
      "ARTIFACT_JSON_NOT_IJSON",
      "Artifact preimage contains an invalid manifest digest",
    );
  }
  const payloadDigests = input.payloads
    .map(({ path, sha256: digest }) => {
      if (!SHA256_DIGEST.test(digest)) {
        throw new CapabilityArtifactError(
          "ARTIFACT_JSON_NOT_IJSON",
          `Artifact preimage contains an invalid payload digest: ${path}`,
        );
      }
      return { path, sha256: digest };
    })
    .sort((left, right) => compareUtf16(left.path, right.path));

  return sha256(
    canonicalizeJson({
      artifactVersion: "spotlight.capability-artifact/1",
      manifestDigest: input.manifestDigest,
      toolManifestDigest: input.toolManifestDigest,
      payloadDigests,
    }),
  );
}
