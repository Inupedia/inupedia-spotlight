#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = process.cwd();
const packageJsonPath = join(packageDir, "package.json");
const checkJsSourceMaps = process.argv.includes("--no-js-sourcemaps");

function fail(message) {
  console.error(`[verify-exports] ${message}`);
  process.exitCode = 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const pkg = readJson(packageJsonPath);

function collectExportTargets(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const next of Object.values(value)) {
    collectExportTargets(next, out);
  }
  return out;
}

for (const [key, value] of Object.entries(pkg.exports ?? {})) {
  const targets = collectExportTargets(value);
  if (!targets.length) fail(`${pkg.name} export ${key} has no file targets`);
  for (const target of targets) {
    if (target.includes("*")) {
      fail(`${pkg.name} export ${key} still uses wildcard target: ${target}`);
      continue;
    }
    if (!target.startsWith("./")) continue;
    const fullPath = resolve(packageDir, target);
    if (!existsSync(fullPath)) {
      fail(`${pkg.name} export ${key} points to missing file: ${target}`);
    }
  }
}

for (const fileEntry of pkg.files ?? []) {
  if (fileEntry.includes("*")) continue;
  const fullPath = resolve(packageDir, fileEntry);
  if (!existsSync(fullPath)) {
    fail(`${pkg.name} files entry is missing: ${fileEntry}`);
  }
}

if (checkJsSourceMaps) {
  const distDir = join(packageDir, "dist");
  const jsMaps = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (name.endsWith(".js.map")) jsMaps.push(path);
    }
  }
  walk(distDir);
  if (jsMaps.length) {
    fail(`${pkg.name} should not publish JavaScript sourcemaps`);
    for (const map of jsMaps.slice(0, 10)) {
      console.error(`  ${map.slice(packageDir.length + 1)}`);
    }
    if (jsMaps.length > 10) console.error(`  ... ${jsMaps.length - 10} more`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[verify-exports] ${pkg.name} exports ok`);
