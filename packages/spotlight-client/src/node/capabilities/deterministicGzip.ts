import { constants, deflateRawSync } from "node:zlib";

import { CapabilityArtifactError } from "./capabilityArtifactError.js";

const GZIP_HEADER = Uint8Array.from([
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
const GZIP_FOOTER_SIZE = 8;
const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    table[value] = crc >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeDeterministicGzipV1(input: Uint8Array): Uint8Array {
  const compressed = Uint8Array.from(
    deflateRawSync(input, {
      level: 9,
      strategy: constants.Z_DEFAULT_STRATEGY,
    }),
  );
  const totalLength = GZIP_HEADER.byteLength + compressed.byteLength + GZIP_FOOTER_SIZE;
  if (!Number.isSafeInteger(totalLength)) {
    throw new CapabilityArtifactError(
      "ARTIFACT_SIZE_OVERFLOW",
      "gzip output exceeds the safe integer range",
    );
  }

  const output = new Uint8Array(totalLength);
  output.set(GZIP_HEADER, 0);
  output.set(compressed, GZIP_HEADER.byteLength);
  const footer = new DataView(
    output.buffer,
    output.byteOffset + output.byteLength - GZIP_FOOTER_SIZE,
    GZIP_FOOTER_SIZE,
  );
  footer.setUint32(0, crc32(input), true);
  footer.setUint32(4, input.byteLength >>> 0, true);
  return output;
}
