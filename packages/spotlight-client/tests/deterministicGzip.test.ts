import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { encodeDeterministicGzipV1 } from "../src/node/capabilities/deterministicGzip.js";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe("encodeDeterministicGzipV1", () => {
  it("writes the fixed Spotlight gzip header", () => {
    const gzip = encodeDeterministicGzipV1(encode("artifact"));
    expect([...gzip.subarray(0, 10)]).toEqual([
      0x1f,
      0x8b,
      8,
      0,
      0,
      0,
      0,
      0,
      2,
      255,
    ]);
  });

  it("writes independently verifiable CRC32 and ISIZE footer", () => {
    const input = encode("Spotlight 确定性 Artifact");
    const gzip = encodeDeterministicGzipV1(input);
    const footer = new DataView(
      gzip.buffer,
      gzip.byteOffset + gzip.byteLength - 8,
      8,
    );
    expect(footer.getUint32(0, true)).toBe(crc32(input));
    expect(footer.getUint32(4, true)).toBe(input.byteLength >>> 0);
  });

  it("round-trips exact bytes with the standard gunzip decoder", () => {
    const input = Uint8Array.from({ length: 4097 }, (_, index) => index % 251);
    expect(Uint8Array.from(gunzipSync(encodeDeterministicGzipV1(input)))).toEqual(
      input,
    );
  });

  it("is byte-identical across repeated calls including empty input", () => {
    const input = encode("same input");
    expect(encodeDeterministicGzipV1(input)).toEqual(
      encodeDeterministicGzipV1(Uint8Array.from(input)),
    );
    expect(encodeDeterministicGzipV1(new Uint8Array())).toEqual(
      encodeDeterministicGzipV1(new Uint8Array()),
    );
  });

  it("matches the pinned fflate 0.8.3 golden vector", () => {
    const gzip = encodeDeterministicGzipV1(
      encode("Spotlight deterministic gzip v1"),
    );
    expect([...gzip]).toEqual([
      31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 11, 46, 200, 47, 201, 201, 76,
      207, 40, 81, 72, 73, 45, 73, 45, 202, 205, 204, 203, 44, 46, 201, 76,
      86, 72, 175, 202, 44, 80, 40, 51, 4, 0, 44, 99, 73, 151, 31, 0, 0, 0,
    ]);
    expect(createHash("sha256").update(gzip).digest("hex")).toBe(
      "1288ec4cc6a81ecec426bbe0e0325012452555dd8e52d8bee692273b08403e97",
    );
  });
});
