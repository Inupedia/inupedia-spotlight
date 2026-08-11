#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/set-release-version.mjs <x.y.z>");
  process.exit(1);
}

const packageDirs = [
  "packages/spotlight-protocol",
  "packages/spotlight-memory",
  "packages/spotlight-client",
  "packages/spotlight-server",
  "packages/spotlight-vue",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

for (const dir of packageDirs) {
  const pkgPath = path.join(rootDir, dir, "package.json");
  const pkg = readJson(pkgPath);
  pkg.version = version;
  delete pkg.private;

  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (
        name.startsWith("@inupedia/spotlight-") &&
        !String(deps[name]).startsWith("workspace:")
      ) {
        deps[name] = version;
      }
    }
  }

  writeJson(pkgPath, pkg);
  console.log(`✓ ${dir} -> ${version}`);
}
