import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  canonicalizeJson,
  compareUtf16,
  containsLoneSurrogate,
} from "./canonicalJson.js";
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

function invalidInput(message: string): never {
  throw new CapabilityArtifactError("ARTIFACT_INPUT_INVALID", message);
}

function isCanonicalArrayIndex(key: string): boolean {
  if (!/^(?:0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index <= 0xfffffffe &&
    String(index) === key
  );
}

function readDenseDataArray(value: unknown, label: string): unknown[] {
  if (isProxy(value)) invalidInput(`${label} must not be a Proxy`);
  if (!Array.isArray(value)) invalidInput(`${label} must be an array`);
  const keys: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !isCanonicalArrayIndex(key)) {
      invalidInput(`${label} contains a non-index property`);
    }
    keys.push(key);
  }
  if (keys.length !== value.length) invalidInput(`${label} must be dense`);
  keys.sort((left, right) => Number(left) - Number(right));
  return keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      invalidInput(`${label}[${key}] must be an enumerable data property`);
    }
    return descriptor.value;
  });
}

function readDataRecord(
  value: unknown,
  label: string,
  allowedFields: ReadonlySet<string>,
): Record<string, unknown> {
  if (isProxy(value)) invalidInput(`${label} must not be a Proxy`);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidInput(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidInput(`${label} must be a plain object`);
  }
  const record: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedFields.has(key)) {
      invalidInput(`${label} contains an unknown field`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      invalidInput(`${label}.${key} must be an enumerable data property`);
    }
    record[key] = descriptor.value;
  }
  return record;
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

function validateSkillName(name: unknown): asserts name is string {
  if (typeof name !== "string") {
    invalidInput("Skill name must be a string");
  }
  if (!CANONICAL_SKILL_NAME.test(name) || name.length > 64) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_INVALID",
      `Invalid canonical Skill name: ${name}`,
    );
  }
}

function validateRelativePath(
  relativePath: unknown,
): asserts relativePath is string {
  if (typeof relativePath !== "string") {
    invalidInput("Skill relativePath must be a string");
  }
  if (
    relativePath.length === 0 ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:/.test(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    containsLoneSurrogate(relativePath) ||
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
  skillManifestBytes?: Uint8Array;
  toolManifestBytes: Uint8Array;
}): BuiltCapabilityFileMapV1 {
  const root = readDataRecord(
    input,
    "Capability file-map input",
    new Set(["skills", "skillManifestBytes", "toolManifestBytes"]),
  );
  if (root.skillManifestBytes !== undefined && (
    isProxy(root.skillManifestBytes) ||
    !(root.skillManifestBytes instanceof Uint8Array)
  )) {
    invalidInput("skillManifestBytes must be a Uint8Array");
  }
  if (
    isProxy(root.toolManifestBytes) ||
    !(root.toolManifestBytes instanceof Uint8Array)
  ) {
    invalidInput("toolManifestBytes must be a Uint8Array");
  }
  const skills = readDenseDataArray(root.skills, "skills");
  const payloads: CapabilityPayloadFileV1[] = [];
  const seenPaths = new Set<string>();

  if (root.skillManifestBytes instanceof Uint8Array) {
    addPayload(
      payloads,
      seenPaths,
      createPayload("skill-manifest.json", root.skillManifestBytes, "application/json"),
    );
  }

  addPayload(
    payloads,
    seenPaths,
    createPayload("tool-manifest.json", root.toolManifestBytes, "application/json"),
  );

  for (const [skillIndex, skillValue] of skills.entries()) {
    const skill = readDataRecord(
      skillValue,
      `skills[${skillIndex}]`,
      new Set(["name", "files"]),
    );
    validateSkillName(skill.name);
    const files = readDenseDataArray(skill.files, `skills[${skillIndex}].files`);
    for (const [fileIndex, fileValue] of files.entries()) {
      const file = readDataRecord(
        fileValue,
        `skills[${skillIndex}].files[${fileIndex}]`,
        new Set(["relativePath", "bytes", "mediaType"]),
      );
      validateRelativePath(file.relativePath);
      if (isProxy(file.bytes) || !(file.bytes instanceof Uint8Array)) {
        invalidInput(
          `skills[${skillIndex}].files[${fileIndex}].bytes must be a Uint8Array`,
        );
      }
      if (
        file.mediaType !== undefined &&
        (typeof file.mediaType !== "string" || file.mediaType.trim().length === 0)
      ) {
        invalidInput(
          `skills[${skillIndex}].files[${fileIndex}].mediaType must be a non-empty string`,
        );
      }
      const path = `skills/${skill.name}/${file.relativePath}`;
      ensureUstarPath(path);
      addPayload(
        payloads,
        seenPaths,
        createPayload(
          path,
          file.bytes,
          typeof file.mediaType === "string"
            ? file.mediaType
            : inferMediaType(path),
        ),
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
  skillManifestDigest?: string;
  toolManifestDigest: string;
  payloads: Array<Pick<CapabilityPayloadFileV1, "path" | "sha256">>;
}): string {
  if (!SHA256_DIGEST.test(input.manifestDigest) || (input.skillManifestDigest !== undefined && !SHA256_DIGEST.test(input.skillManifestDigest)) || !SHA256_DIGEST.test(input.toolManifestDigest)) {
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
      ...(input.skillManifestDigest ? { skillManifestDigest: input.skillManifestDigest } : {}),
      toolManifestDigest: input.toolManifestDigest,
      payloadDigests,
    }),
  );
}
