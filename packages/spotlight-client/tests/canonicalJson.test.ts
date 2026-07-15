import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  compareUtf16,
} from "../src/node/capabilities/canonicalJson.js";

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function expectArtifactError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("canonicalizeJson", () => {
  it("matches RFC 8785 recursive property ordering and UTF-8 output", () => {
    const first = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      nested: [{ z: true, a: false }],
      literals: [null, true, false],
      string: "€$\u000f\nA'B\"\\\\\"/",
    };
    const second = {
      string: "€$\u000f\nA'B\"\\\\\"/",
      literals: [null, true, false],
      nested: [{ a: false, z: true }],
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
    };

    const expected =
      "{\"literals\":[null,true,false],\"nested\":[{\"a\":false,\"z\":true}],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}";

    expect(decode(canonicalizeJson(first))).toBe(expected);
    expect(canonicalizeJson(second)).toEqual(canonicalizeJson(first));
    expect(canonicalizeJson(first)).toEqual(new TextEncoder().encode(expected));
  });

  it("sorts property names by raw UTF-16 code units without locale rules", () => {
    const value = {
      "\ufb33": "Hebrew",
      "😀": "Emoji",
      "€": "Euro",
      ö: "Latin",
      "\u0080": "Control",
      "1": "One",
      "\r": "Carriage Return",
    };

    expect(Object.keys(value).sort(compareUtf16)).toEqual([
      "\r",
      "1",
      "\u0080",
      "ö",
      "€",
      "😀",
      "\ufb33",
    ]);
    expect(decode(canonicalizeJson(value))).toBe(
      "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin\",\"€\":\"Euro\",\"😀\":\"Emoji\",\"דּ\":\"Hebrew\"}",
    );
  });

  it("accepts repeated acyclic references", () => {
    const shared = { value: 1 };
    expect(decode(canonicalizeJson({ left: shared, right: shared }))).toBe(
      "{\"left\":{\"value\":1},\"right\":{\"value\":1}}",
    );
  });

  it.each([
    ["lone high surrogate", { value: "\ud800" }],
    ["lone low surrogate", { value: "\udc00" }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
  ])("rejects non-I-JSON input: %s", (_label, value) => {
    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_NOT_IJSON",
    );
  });

  it.each([
    ["undefined", { value: undefined }],
    ["bigint", { value: 1n }],
    ["function", { value: () => undefined }],
    ["symbol", { value: Symbol("value") }],
    ["date", { value: new Date(0) }],
    ["class instance", { value: new (class Fixture {})() }],
  ])("rejects unsupported JSON values: %s", (_label, value) => {
    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
  });

  it("rejects sparse arrays instead of serializing holes as null", () => {
    const sparse = Array.from({ length: 2 }) as unknown[];
    sparse[1] = "present";
    expectArtifactError(
      () => canonicalizeJson(sparse),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
  });

  it("rejects symbol-keyed properties instead of omitting them", () => {
    const value = { visible: true } as Record<PropertyKey, unknown>;
    value[Symbol("hidden")] = true;
    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
  });

  it("rejects cyclic input", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
  });

  it("rejects array accessors without executing project getters", () => {
    let executed = false;
    const value: unknown[] = [];
    Object.defineProperty(value, 0, {
      enumerable: true,
      get() {
        executed = true;
        return "hidden behavior";
      },
    });
    value.length = 1;

    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
    expect(executed).toBe(false);
  });

  it("rejects numeric-looking array properties that JSON arrays omit", () => {
    const value: unknown[] = [];
    Object.defineProperty(value, "4294967295", {
      enumerable: true,
      value: "silently omitted by Array.map",
    });
    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
  });

  it("rejects huge sparse array lengths without iterating every hole", () => {
    const value: unknown[] = [];
    Object.defineProperty(value, "4294967294", {
      enumerable: true,
      value: "last valid array index",
    });
    const startedAt = performance.now();
    expectArtifactError(
      () => canonicalizeJson(value),
      "ARTIFACT_JSON_UNSUPPORTED_VALUE",
    );
    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});
