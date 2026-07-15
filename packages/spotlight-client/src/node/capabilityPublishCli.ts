import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { CapabilityArtifactAttestationV1 } from "@inupedia/spotlight-protocol";
import { canonicalizeJson } from "./capabilities/canonicalJson.js";
import { computeArtifactDigestV1 } from "./capabilities/capabilityFileMap.js";
import { canonicalArchivePathProblem } from "./capabilities/archivePath.js";

function args(argv: readonly string[]): Record<string, string> { const parsed: Record<string, string> = {}; for (let i=0;i<argv.length;i+=2) { const k=argv[i], v=argv[i+1]; if (!k?.startsWith("--") || !v) throw new TypeError("Capability publish CLI expects --key value arguments."); parsed[k.slice(2)] = v; } return parsed; }
const sha256 = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function tarFiles(archive: Uint8Array): Map<string, Uint8Array> {
  const tar = Uint8Array.from(gunzipSync(archive)); const files = new Map<string, Uint8Array>(); const seenPaths=new Set<string>(); let offset=0;
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0)));
  while (offset + 512 <= tar.length) {
    const h=tar.subarray(offset,offset+512);
    if (h.every((b)=>b===0)) { const second=tar.subarray(offset+512,offset+1024); if(second.length<512||!second.every((b)=>b===0)||!tar.subarray(offset+1024).every((b)=>b===0)) throw new TypeError("Invalid USTAR trailing content."); return files; }
    const storedText=text(h.subarray(148,156)).trim(); if(!/^[0-7]+$/.test(storedText)) throw new TypeError("Invalid USTAR header checksum field."); const stored=Number.parseInt(storedText,8); let sum=0; for(let i=0;i<512;i++) sum+=i>=148&&i<156?32:(h[i]??0); if(sum!==stored) throw new TypeError("Invalid USTAR header checksum.");
    if(text(h.subarray(257,263))!=="ustar"||text(h.subarray(263,265))!=="00") throw new TypeError("Invalid USTAR header magic.");
    const type=h[156]; if(type!==48&&type!==0&&type!==53) throw new TypeError("Artifact contains an unsupported USTAR entry.");
    const name=text(h.subarray(0,100)); const prefix=text(h.subarray(345,500)); const rawPath=prefix?`${prefix}/${name}`:name; const isDirectory=type===53; const path=isDirectory?rawPath.replace(/\/$/,""):rawPath; if(canonicalArchivePathProblem(rawPath,{directory:isDirectory})||seenPaths.has(path)) throw new TypeError("Invalid or duplicate USTAR path."); seenPaths.add(path);
    const sizeText=text(h.subarray(124,136)).trim(); if(!/^[0-7]+$/.test(sizeText)) throw new TypeError("Invalid USTAR size field."); const size=Number.parseInt(sizeText,8); if(isDirectory&&size!==0) throw new TypeError("USTAR directory must be zero length."); const start=offset+512,end=start+size,padded=start+Math.ceil(size/512)*512; if(end>tar.length||!tar.subarray(end,padded).every((b)=>b===0)) throw new TypeError("Invalid USTAR payload padding."); if(!isDirectory) files.set(path,tar.slice(start,end)); offset=padded;
  }
  throw new TypeError("USTAR archive is missing terminal zero blocks.");
}
function verify(archive: Uint8Array, info: Record<string, unknown>) {
  const files=tarFiles(archive); const manifestBytes=files.get("manifest.json"), skillBytes=files.get("skill-manifest.json"), toolBytes=files.get("tool-manifest.json");
  if (!manifestBytes || !skillBytes || !toolBytes) throw new TypeError("Artifact is missing required manifests.");
  const manifest=JSON.parse(new TextDecoder().decode(manifestBytes)) as { files: Array<{path:string;sha256:string;byteLength:number}> };
  const manifestPaths=manifest.files.map((entry)=>entry.path); if(new Set(manifestPaths).size!==manifestPaths.length) throw new TypeError("Artifact manifest contains duplicate file declarations.");
  const declared=new Set(["manifest.json",...manifestPaths]); if(files.size!==declared.size||[...files.keys()].some((path)=>!declared.has(path))) throw new TypeError("Artifact contains undeclared regular files.");
  for (const entry of manifest.files) { const bytes=files.get(entry.path); if (!bytes || bytes.byteLength!==entry.byteLength || sha256(bytes)!==entry.sha256) throw new TypeError(`Artifact payload mismatch: ${entry.path}`); }
  const manifestDigest=sha256(manifestBytes), skillManifestDigest=sha256(skillBytes), toolManifestDigest=sha256(toolBytes);
  const artifactDigest=computeArtifactDigestV1({ manifestDigest, skillManifestDigest, toolManifestDigest, payloads: manifest.files });
  const actual={ digest:artifactDigest, manifestDigest, skillManifestDigest, toolManifestDigest, byteLength:archive.byteLength };
  const expected={ digest:info.artifactDigest, manifestDigest:info.manifestDigest, skillManifestDigest:info.skillManifestDigest, toolManifestDigest:info.toolManifestDigest, byteLength:info.byteLength };
  if (JSON.stringify(actual)!==JSON.stringify(expected)) throw new TypeError("Artifact digests do not match build info."); return actual;
}
export async function runCapabilityPublishCliV1(argv: readonly string[]): Promise<number> {
  const input=args(argv); if (!input.artifact||!input["build-info"]||!input["out-dir"]) throw new TypeError("Required: --artifact --build-info --out-dir");
  const [archive,infoText]=await Promise.all([readFile(input.artifact),readFile(input["build-info"],"utf8")]); const info=JSON.parse(infoText) as Record<string,unknown>;
  for (const field of ["projectId","frontendBuildId"] as const) if(typeof info[field]!=="string"||!info[field]) throw new TypeError(`Invalid build info field: ${field}`);
  const artifact=verify(archive,info); const attestation:CapabilityArtifactAttestationV1={schemaVersion:"spotlight.capability-attestation/1",projectId:info.projectId as string,frontendBuildId:info.frontendBuildId as string,artifact,createdAt:input["created-at"]??new Date().toISOString()};
  const out=input["out-dir"]; await mkdir(dirname(out),{recursive:true}); await access(out).then(()=>{throw new TypeError("Publish output already exists.");},()=>undefined);
  const staging=await mkdtemp(join(dirname(out),`.${basename(out)}.tmp-`));
  try { await Promise.all([writeFile(join(staging,`${artifact.digest}.tgz`),archive,{flag:"wx"}),writeFile(join(staging,"capability-attestation.json"),`${new TextDecoder().decode(canonicalizeJson(attestation))}\n`,{flag:"wx",encoding:"utf8"})]); await rename(staging,out); } catch(error) { await rm(staging,{recursive:true,force:true}); throw error; }
  return 0;
}
