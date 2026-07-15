import { compareUtf16 } from "./canonicalJson.js";
import { canonicalArchivePathProblem } from "./archivePath.js";
import { CapabilityArtifactError } from "./capabilityArtifactError.js";

const TAR_BLOCK_SIZE = 512;
const textEncoder = new TextEncoder();

export interface TarFileEntryV1 {
  path: string;
  bytes: Uint8Array;
}

type TarEntry =
  | { path: string; type: "directory" }
  | { path: string; type: "file"; bytes: Uint8Array };

function failInvalidPath(path: string): never {
  throw new CapabilityArtifactError(
    "ARTIFACT_PATH_INVALID",
    `Invalid USTAR file path: ${path}`,
  );
}

function validateFilePath(path: string): void {
  if (canonicalArchivePathProblem(path)) failInvalidPath(path);
}

function byteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function splitUstarPath(path: string): { name: string; prefix: string } {
  if (byteLength(path) <= 100) return { name: path, prefix: "" };

  for (let index = path.lastIndexOf("/"); index > 0; index = path.lastIndexOf("/", index - 1)) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (name.length > 0 && byteLength(prefix) <= 155 && byteLength(name) <= 100) {
      return { name, prefix };
    }
  }

  throw new CapabilityArtifactError(
    "ARTIFACT_PATH_USTAR_UNREPRESENTABLE",
    `Path cannot be represented by POSIX USTAR: ${path}`,
  );
}

function writeAscii(
  block: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = textEncoder.encode(value);
  if (bytes.byteLength > length) {
    throw new CapabilityArtifactError(
      "ARTIFACT_PATH_USTAR_UNREPRESENTABLE",
      `USTAR field exceeds ${length} bytes: ${value}`,
    );
  }
  block.set(bytes, offset);
}

function writeOctal(
  block: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CapabilityArtifactError(
      "ARTIFACT_SIZE_OVERFLOW",
      `USTAR numeric field is outside the safe integer range: ${value}`,
    );
  }
  const octal = value.toString(8);
  if (octal.length > length - 1) {
    throw new CapabilityArtifactError(
      "ARTIFACT_SIZE_OVERFLOW",
      `USTAR numeric field exceeds ${length - 1} octal digits: ${value}`,
    );
  }
  writeAscii(block, offset, length, `${octal.padStart(length - 1, "0")}\0`);
}

function writeChecksum(block: Uint8Array, checksum: number): void {
  const octal = checksum.toString(8);
  if (octal.length > 6) {
    throw new CapabilityArtifactError(
      "ARTIFACT_SIZE_OVERFLOW",
      `USTAR checksum exceeds six octal digits: ${checksum}`,
    );
  }
  writeAscii(block, 148, 8, `${octal.padStart(6, "0")}\0 `);
}

function createHeader(entry: TarEntry): Uint8Array {
  const block = new Uint8Array(TAR_BLOCK_SIZE);
  const { name, prefix } = splitUstarPath(entry.path);
  writeAscii(block, 0, 100, name);
  writeOctal(block, 100, 8, entry.type === "directory" ? 0o755 : 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, entry.type === "directory" ? 0 : entry.bytes.byteLength);
  writeOctal(block, 136, 12, 0);
  block.fill(0x20, 148, 156);
  block[156] = (entry.type === "directory" ? "5" : "0").charCodeAt(0);
  writeAscii(block, 257, 6, "ustar\0");
  writeAscii(block, 263, 2, "00");
  writeOctal(block, 329, 8, 0);
  writeOctal(block, 337, 8, 0);
  writeAscii(block, 345, 155, prefix);

  let checksum = 0;
  for (const byte of block) checksum += byte;
  writeChecksum(block, checksum);
  return block;
}

function collectEntries(files: TarFileEntryV1[]): TarEntry[] {
  const filePaths = new Set<string>();
  const directoryPaths = new Set<string>();
  const fileEntries: TarEntry[] = [];

  for (const file of files) {
    validateFilePath(file.path);
    splitUstarPath(file.path);
    if (filePaths.has(file.path)) {
      throw new CapabilityArtifactError(
        "ARTIFACT_PATH_DUPLICATE",
        `Duplicate USTAR file path: ${file.path}`,
      );
    }
    filePaths.add(file.path);
    fileEntries.push({ path: file.path, type: "file", bytes: file.bytes });

    const segments = file.path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const directory = `${segments.slice(0, index).join("/")}/`;
      splitUstarPath(directory);
      directoryPaths.add(directory);
    }
  }

  for (const directory of directoryPaths) {
    if (filePaths.has(directory.slice(0, -1))) {
      throw new CapabilityArtifactError(
        "ARTIFACT_PATH_DUPLICATE",
        `USTAR path is both a file and directory: ${directory}`,
      );
    }
  }

  const entries: TarEntry[] = [
    ...[...directoryPaths].map((path): TarEntry => ({ path, type: "directory" })),
    ...fileEntries,
  ];
  entries.sort((left, right) => compareUtf16(left.path, right.path));
  return entries;
}

export function encodeDeterministicUstarV1(files: TarFileEntryV1[]): Uint8Array {
  const entries = collectEntries(files);
  let totalLength = TAR_BLOCK_SIZE * 2;
  for (const entry of entries) {
    totalLength += TAR_BLOCK_SIZE;
    if (entry.type === "file") {
      totalLength += Math.ceil(entry.bytes.byteLength / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    }
    if (!Number.isSafeInteger(totalLength)) {
      throw new CapabilityArtifactError(
        "ARTIFACT_SIZE_OVERFLOW",
        "USTAR archive size exceeds the safe integer range",
      );
    }
  }

  const archive = new Uint8Array(totalLength);
  let offset = 0;
  for (const entry of entries) {
    archive.set(createHeader(entry), offset);
    offset += TAR_BLOCK_SIZE;
    if (entry.type === "file") {
      archive.set(entry.bytes, offset);
      offset += Math.ceil(entry.bytes.byteLength / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    }
  }
  return archive;
}
