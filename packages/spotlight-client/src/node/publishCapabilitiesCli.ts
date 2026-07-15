#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CapabilityBuildInfoV1 } from "../vite/capabilityBuildTypes.js";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function main(): Promise<void> {
  const endpoint = argument("endpoint").replace(/\/$/, "");
  const info = JSON.parse(await readFile(resolve(argument("build-info")), "utf8")) as CapabilityBuildInfoV1;
  const archive = await readFile(resolve(argument("artifact")));
  const apiKey = process.env.SPOTLIGHT_API_KEY;
  const response = await fetch(`${endpoint}/v1/capability-artifacts/${encodeURIComponent(info.artifactDigest)}/published`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/gzip",
      ...(apiKey ? { "X-Spotlight-Api-Key": apiKey } : {}),
      "X-Spotlight-Project-Id": info.projectId,
      "X-Spotlight-Frontend-Build-Id": info.frontendBuildId,
      "X-Spotlight-Manifest-Digest": info.manifestDigest,
      "X-Spotlight-Skill-Manifest-Digest": info.skillManifestDigest,
      "X-Spotlight-Tool-Manifest-Digest": info.toolManifestDigest,
    },
    body: archive,
  });
  if (!response.ok) throw new Error(`Artifact publish failed (${response.status}): ${await response.text()}`);
  process.stdout.write(`${await response.text()}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
