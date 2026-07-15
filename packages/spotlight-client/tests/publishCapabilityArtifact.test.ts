import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishCapabilityArtifactV1 } from "../src/node/publishCapabilityArtifact.js";
import { runCapabilityPublishCliV1 } from "../src/node/capabilityPublishCli.js";
import { buildCapabilityArtifactV1 } from "../src/node/index.js";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("CI capability prepublish", () => {
  it("writes immutable Artifact, build info and attestation without browser handlers", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "spotlight-publish-")); cleanup.push(outDir);
    await publishCapabilityArtifactV1({ outDir, projectId: "ydjm", frontendBuildId: "build-1", build: { artifactVersion: "spotlight.capability-artifact/1", artifactDigest: "sha256:a", manifestDigest: "sha256:m", skillManifestDigest: "sha256:s", toolManifestDigest: "sha256:t", byteLength: 3, archive: new Uint8Array([1,2,3]), manifestBytes: new Uint8Array(), skillManifestBytes: new Uint8Array(), toolManifestBytes: new Uint8Array() }, createdAt: "2026-07-15T00:00:00.000Z" });
    expect(new Uint8Array(await readFile(join(outDir, "sha256:a.tgz")))).toEqual(new Uint8Array([1,2,3]));
    expect(JSON.parse(await readFile(join(outDir, "capability-attestation.json"), "utf8"))).toMatchObject({ projectId: "ydjm", artifact: { digest: "sha256:a" } });
  });

  it("provides a CI CLI runner over prebuilt files", async () => {
    const root = await mkdtemp(join(tmpdir(), "spotlight-cli-")); cleanup.push(root);
    const artifact = join(root, "artifact.tgz");
    const info = join(root, "capability-build-info.json");
    const outDir = join(root, "published");
    const build = buildCapabilityArtifactV1({ skills: [], tools: [] });
    await import("node:fs/promises").then(({ writeFile }) => Promise.all([
      writeFile(artifact, build.archive),
      writeFile(info, JSON.stringify({ schemaVersion: "spotlight.capability-build-info/1", projectId: "ydjm", frontendBuildId: "build-1", ...build, archive: undefined, manifestBytes: undefined, skillManifestBytes: undefined, toolManifestBytes: undefined })),
    ]));
    await expect(runCapabilityPublishCliV1(["--artifact", artifact, "--build-info", info, "--out-dir", outDir, "--created-at", "2026-07-15T00:00:00.000Z"])).resolves.toBe(0);
    expect(new Uint8Array(await readFile(join(outDir, `${build.artifactDigest}.tgz`)))).toEqual(build.archive);
  });

  it("rejects forged build info and leaves no partial output", async () => {
    const root = await mkdtemp(join(tmpdir(), "spotlight-forged-")); cleanup.push(root);
    const artifact = join(root, "artifact.tgz"); const info = join(root, "info.json"); const outDir = join(root, "out");
    const { writeFile, stat } = await import("node:fs/promises");
    await writeFile(artifact, new Uint8Array([1,2,3]));
    await writeFile(info, JSON.stringify({ projectId: "p", frontendBuildId: "b", artifactDigest: "sha256:fake", manifestDigest: "sha256:fake", skillManifestDigest: "sha256:fake", toolManifestDigest: "sha256:fake", byteLength: 3 }));
    await expect(runCapabilityPublishCliV1(["--artifact", artifact, "--build-info", info, "--out-dir", outDir])).rejects.toThrow();
    await expect(stat(outDir)).rejects.toThrow();
  });
  it("rejects a tar with an invalid header checksum", async () => {
    const root=await mkdtemp(join(tmpdir(),"spotlight-badtar-")); cleanup.push(root); const build=buildCapabilityArtifactV1({skills:[],tools:[]}); const {gunzipSync,gzipSync}=await import("node:zlib"); const tar=gunzipSync(build.archive); tar[0]^=1; const artifact=join(root,"bad.tgz"),info=join(root,"info.json"),out=join(root,"out"); const {writeFile}=await import("node:fs/promises"); await writeFile(artifact,gzipSync(tar)); await writeFile(info,JSON.stringify({projectId:"p",frontendBuildId:"b",artifactDigest:build.artifactDigest,manifestDigest:build.manifestDigest,skillManifestDigest:build.skillManifestDigest,toolManifestDigest:build.toolManifestDigest,byteLength:gzipSync(tar).byteLength})); await expect(runCapabilityPublishCliV1(["--artifact",artifact,"--build-info",info,"--out-dir",out])).rejects.toThrow(/checksum|header/i);
  });
  it("publishes a real nested Skill archive containing USTAR directories", async () => {
    const root=await mkdtemp(join(tmpdir(),"spotlight-nested-")); cleanup.push(root); const build=buildCapabilityArtifactV1({skills:[{name:"monitoring",files:[{relativePath:"SKILL.md",bytes:new TextEncoder().encode("---\nname: monitoring\ndescription: Monitor\n---\n")},{relativePath:"references/cameras.json",bytes:new TextEncoder().encode("{}") }]}],tools:[]}); const artifact=join(root,"artifact.tgz"),info=join(root,"info.json"),out=join(root,"out"); const {writeFile}=await import("node:fs/promises"); await writeFile(artifact,build.archive); await writeFile(info,JSON.stringify({projectId:"p",frontendBuildId:"b",artifactDigest:build.artifactDigest,manifestDigest:build.manifestDigest,skillManifestDigest:build.skillManifestDigest,toolManifestDigest:build.toolManifestDigest,byteLength:build.byteLength})); await expect(runCapabilityPublishCliV1(["--artifact",artifact,"--build-info",info,"--out-dir",out])).resolves.toBe(0); expect(new Uint8Array(await readFile(join(out,`${build.artifactDigest}.tgz`)))).toEqual(build.archive);
  });
  it("rejects duplicate manifest file declarations before digest comparison", async () => {
    const root=await mkdtemp(join(tmpdir(),"spotlight-dupmanifest-")); cleanup.push(root); const base=buildCapabilityArtifactV1({skills:[],tools:[]}); const manifest=JSON.parse(new TextDecoder().decode(base.manifestBytes)); manifest.files.push({...manifest.files[0]}); const {canonicalizeJson}=await import("../src/node/capabilities/canonicalJson.js"); const {encodeDeterministicUstarV1}=await import("../src/node/capabilities/deterministicTar.js"); const {encodeDeterministicGzipV1}=await import("../src/node/capabilities/deterministicGzip.js"); const archive=encodeDeterministicGzipV1(encodeDeterministicUstarV1([{path:"manifest.json",bytes:canonicalizeJson(manifest)},{path:"skill-manifest.json",bytes:base.skillManifestBytes},{path:"tool-manifest.json",bytes:base.toolManifestBytes}])); const artifact=join(root,"a.tgz"),info=join(root,"i.json"),out=join(root,"out"); const {writeFile}=await import("node:fs/promises"); await writeFile(artifact,archive); await writeFile(info,JSON.stringify({projectId:"p",frontendBuildId:"b",artifactDigest:base.artifactDigest,manifestDigest:base.manifestDigest,skillManifestDigest:base.skillManifestDigest,toolManifestDigest:base.toolManifestDigest,byteLength:archive.byteLength})); await expect(runCapabilityPublishCliV1(["--artifact",artifact,"--build-info",info,"--out-dir",out])).rejects.toThrow(/duplicate/i);
  });
});
