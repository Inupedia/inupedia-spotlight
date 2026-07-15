import canonicalize from "canonicalize";

import { CapabilityArtifactError } from "./capabilityArtifactError.js";

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

const textEncoder = new TextEncoder();

export function compareUtf16(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function containsLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function fail(
  code: "ARTIFACT_JSON_NOT_IJSON" | "ARTIFACT_JSON_UNSUPPORTED_VALUE",
  path: string,
  reason: string,
): never {
  throw new CapabilityArtifactError(code, `${path}: ${reason}`);
}

function validateString(value: string, path: string): void {
  if (containsLoneSurrogate(value)) {
    fail("ARTIFACT_JSON_NOT_IJSON", path, "contains a lone surrogate");
  }
}

function validateArray(
  value: unknown[],
  path: string,
  stack: WeakSet<object>,
): void {
  const ownKeys = Reflect.ownKeys(value);
  const indexedKeys: string[] = [];
  for (const key of ownKeys) {
    if (key === "length") continue;
    const index = typeof key === "string" ? Number(key) : Number.NaN;
    if (
      typeof key !== "string" ||
      !/^(?:0|[1-9]\d*)$/.test(key) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 0xfffffffe ||
      String(index) !== key
    ) {
      fail(
        "ARTIFACT_JSON_UNSUPPORTED_VALUE",
        path,
        "array contains a non-index property",
      );
    }
    indexedKeys.push(key);
  }

  if (indexedKeys.length !== value.length) {
    fail(
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
      path,
      "sparse array entries are not supported",
    );
  }

  for (const key of indexedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail(
        "ARTIFACT_JSON_UNSUPPORTED_VALUE",
        `${path}[${key}]`,
        "accessor and non-enumerable array entries are not supported",
      );
    }
    validateJsonValue(descriptor.value, `${path}[${key}]`, stack);
  }
}

function validateObject(
  value: object,
  path: string,
  stack: WeakSet<object>,
): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
      path,
      "only plain JSON objects are supported",
    );
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      fail(
        "ARTIFACT_JSON_UNSUPPORTED_VALUE",
        path,
        "symbol-keyed properties are not supported",
      );
    }
    validateString(key, `${path} property name`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail(
        "ARTIFACT_JSON_UNSUPPORTED_VALUE",
        `${path}.${key}`,
        "accessor and non-enumerable properties are not supported",
      );
    }
    validateJsonValue(descriptor.value, `${path}.${key}`, stack);
  }
}

function validateJsonValue(
  value: unknown,
  path: string,
  stack: WeakSet<object>,
): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    validateString(value, path);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("ARTIFACT_JSON_NOT_IJSON", path, "number must be finite");
    }
    return;
  }
  if (typeof value !== "object") {
    fail(
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
      path,
      `unsupported value type ${typeof value}`,
    );
  }

  if (stack.has(value)) {
    fail("ARTIFACT_JSON_UNSUPPORTED_VALUE", path, "cyclic value graph");
  }
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      validateArray(value, path, stack);
    } else {
      validateObject(value, path, stack);
    }
  } finally {
    stack.delete(value);
  }
}

export function canonicalizeJson(value: unknown): Uint8Array {
  validateJsonValue(value, "$", new WeakSet<object>());
  const serialized = canonicalize(value);
  if (serialized === undefined) {
    fail(
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
      "$",
      "canonicalizer returned no JSON output",
    );
  }
  return textEncoder.encode(serialized);
}
