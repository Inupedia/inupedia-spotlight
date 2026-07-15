import { describe, expect, it } from "vitest";

import { encodeDeterministicUstarV1 } from "../src/node/capabilities/deterministicTar.js";

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

type ParsedTarEntry = {
  path: string;
  mode: number;
  uid: number;
  gid: number;
  size: number;
  mtime: number;
  checksum: number;
  computedChecksum: number;
  typeflag: string;
  linkname: string;
  magic: string;
  version: string;
  uname: string;
  gname: string;
  devmajor: number;
  devminor: number;
  body: Uint8Array;
};

function readString(block: Uint8Array, offset: number, length: number): string {
  const field = block.subarray(offset, offset + length);
  const nul = field.indexOf(0);
  return decode(nul >= 0 ? field.subarray(0, nul) : field);
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
  const value = readString(block, offset, length).trim();
  return value.length === 0 ? 0 : Number.parseInt(value, 8);
}

function headerChecksum(block: Uint8Array): number {
  let checksum = 0;
  for (let index = 0; index < 512; index += 1) {
    checksum += index >= 148 && index < 156 ? 0x20 : (block[index] ?? 0);
  }
  return checksum;
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function parseTar(archive: Uint8Array): ParsedTarEntry[] {
  const entries: ParsedTarEntry[] = [];
  let offset = 0;
  while (offset + 512 <= archive.byteLength) {
    const header = archive.subarray(offset, offset + 512);
    if (isZeroBlock(header)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    const bodyStart = offset + 512;
    const body = archive.slice(bodyStart, bodyStart + size);
    entries.push({
      path: prefix ? `${prefix}/${name}` : name,
      mode: readOctal(header, 100, 8),
      uid: readOctal(header, 108, 8),
      gid: readOctal(header, 116, 8),
      size,
      mtime: readOctal(header, 136, 12),
      checksum: readOctal(header, 148, 8),
      computedChecksum: headerChecksum(header),
      typeflag: String.fromCharCode(header[156] ?? 0),
      linkname: readString(header, 157, 100),
      magic: decode(header.subarray(257, 263)),
      version: decode(header.subarray(263, 265)),
      uname: readString(header, 265, 32),
      gname: readString(header, 297, 32),
      devmajor: readOctal(header, 329, 8),
      devminor: readOctal(header, 337, 8),
      body,
    });
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return entries;
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

describe("encodeDeterministicUstarV1", () => {
  const files = [
    { path: "tool-manifest.json", bytes: encode("tools") },
    { path: "skills/camera/SKILL.md", bytes: encode("camera") },
    { path: "manifest.json", bytes: encode("manifest") },
  ];

  it("writes fixed POSIX USTAR metadata and valid checksums", () => {
    const archive = encodeDeterministicUstarV1(files);
    const entries = parseTar(archive);

    expect(entries.map(({ path }) => path)).toEqual([
      "manifest.json",
      "skills/",
      "skills/camera/",
      "skills/camera/SKILL.md",
      "tool-manifest.json",
    ]);
    for (const entry of entries) {
      expect(entry.magic).toBe("ustar\0");
      expect(entry.version).toBe("00");
      expect(entry.uid).toBe(0);
      expect(entry.gid).toBe(0);
      expect(entry.mtime).toBe(0);
      expect(entry.uname).toBe("");
      expect(entry.gname).toBe("");
      expect(entry.linkname).toBe("");
      expect(entry.devmajor).toBe(0);
      expect(entry.devminor).toBe(0);
      expect(entry.checksum).toBe(entry.computedChecksum);
      if (entry.typeflag === "5") {
        expect(entry.mode).toBe(0o755);
        expect(entry.size).toBe(0);
      } else {
        expect(entry.typeflag).toBe("0");
        expect(entry.mode).toBe(0o644);
      }
    }
  });

  it("pads bodies to blocks and ends with exactly two zero blocks", () => {
    const archive = encodeDeterministicUstarV1([
      { path: "a.txt", bytes: Uint8Array.from({ length: 513 }, (_, index) => index % 251) },
    ]);
    const expectedBlocks = 1 + 2 + 2;
    expect(archive.byteLength).toBe(expectedBlocks * 512);
    expect(isZeroBlock(archive.subarray(-1024, -512))).toBe(true);
    expect(isZeroBlock(archive.subarray(-512))).toBe(true);
    expect(archive.subarray(512 + 513, 512 + 1024).every((byte) => byte === 0)).toBe(true);
  });

  it("is independent of caller file order and does not mutate it", () => {
    const reversed = [...files].reverse();
    const expectedOrder = reversed.map(({ path }) => path);
    expect(encodeDeterministicUstarV1(reversed)).toEqual(
      encodeDeterministicUstarV1(files),
    );
    expect(reversed.map(({ path }) => path)).toEqual(expectedOrder);
  });

  it("round-trips exact regular-file bodies", () => {
    const entries = parseTar(encodeDeterministicUstarV1(files)).filter(
      ({ typeflag }) => typeflag === "0",
    );
    expect(
      Object.fromEntries(entries.map(({ path, body }) => [path, decode(body)])),
    ).toEqual({
      "manifest.json": "manifest",
      "skills/camera/SKILL.md": "camera",
      "tool-manifest.json": "tools",
    });
  });

  it("splits long paths into USTAR prefix and name fields", () => {
    const path = `${"segment/".repeat(12)}document.md`;
    const archive = encodeDeterministicUstarV1([{ path, bytes: encode("body") }]);
    const file = parseTar(archive).find((entry) => entry.typeflag === "0");
    expect(file?.path).toBe(path);
    expect(decode(file?.body ?? new Uint8Array())).toBe("body");
  });

  it("emits each synthetic ancestor directory once", () => {
    const entries = parseTar(
      encodeDeterministicUstarV1([
        { path: "skills/camera/SKILL.md", bytes: encode("one") },
        { path: "skills/camera/references/info.md", bytes: encode("two") },
      ]),
    );
    expect(entries.filter(({ path }) => path === "skills/")).toHaveLength(1);
    expect(entries.filter(({ path }) => path === "skills/camera/")).toHaveLength(1);
  });

  it("rejects paths that require PAX or GNU extensions", () => {
    expectArtifactError(
      () =>
        encodeDeterministicUstarV1([
          { path: `${"x".repeat(101)}.md`, bytes: encode("body") },
        ]),
      "ARTIFACT_PATH_USTAR_UNREPRESENTABLE",
    );
  });

  it("rejects duplicate and unsafe file paths at the encoder boundary", () => {
    expectArtifactError(
      () =>
        encodeDeterministicUstarV1([
          { path: "same.txt", bytes: encode("one") },
          { path: "same.txt", bytes: encode("two") },
        ]),
      "ARTIFACT_PATH_DUPLICATE",
    );
    expectArtifactError(
      () => encodeDeterministicUstarV1([{ path: "../escape", bytes: encode("x") }]),
      "ARTIFACT_PATH_INVALID",
    );
  });

  it("rejects a path that would be both a regular file and a directory", () => {
    expectArtifactError(
      () =>
        encodeDeterministicUstarV1([
          { path: "skills", bytes: encode("file") },
          { path: "skills/camera/SKILL.md", bytes: encode("nested") },
        ]),
      "ARTIFACT_PATH_DUPLICATE",
    );
  });

  it("rejects lone-surrogate paths before they collide as replacement characters", () => {
    expectArtifactError(
      () =>
        encodeDeterministicUstarV1([
          { path: "assets/\ud800.txt", bytes: encode("high") },
          { path: "assets/\udc00.txt", bytes: encode("low") },
          { path: "assets/�.txt", bytes: encode("replacement") },
        ]),
      "ARTIFACT_PATH_INVALID",
    );
  });
});
