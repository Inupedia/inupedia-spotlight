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
});
