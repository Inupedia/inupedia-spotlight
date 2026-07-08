import type { MilvusClient } from "@zilliz/milvus2-sdk-node";

let client: MilvusClient | null = null;
let dbReady = false;

export const SPOTLIGHT_MILVUS_SEMANTIC_COLLECTION = "spotlight_gate_semantic";

export function resolveSpotlightMilvusUri(): string | null {
  return process.env.SPOTLIGHT_MILVUS_URI?.trim() || null;
}

/** 独立 Milvus 数据库，避免与 Yuxi 知识库 `yuxi` / `default` 混用。 */
export function resolveSpotlightMilvusDb(): string {
  return process.env.SPOTLIGHT_MILVUS_DB?.trim() || "spotlight";
}

export function resolveSpotlightMilvusToken(): string {
  return process.env.SPOTLIGHT_MILVUS_TOKEN?.trim() || "";
}

export function resolveSpotlightMilvusEmbeddingDim(): number {
  const raw = Number(process.env.SPOTLIGHT_MILVUS_EMBEDDING_DIM ?? "1024");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1024;
}

export function isSpotlightMilvusConfigured(): boolean {
  return Boolean(resolveSpotlightMilvusUri());
}

async function ensureSpotlightMilvusDatabase(
  milvus: MilvusClient,
): Promise<void> {
  if (dbReady) return;
  const dbName = resolveSpotlightMilvusDb();
  const listed = await milvus.listDatabases();
  const names = (listed.db_names as string[] | undefined) ?? [];
  if (!names.includes(dbName)) {
    await milvus.createDatabase({ db_name: dbName });
  }
  await milvus.useDatabase({ db_name: dbName });
  dbReady = true;
}

function normalizeMilvusAddress(uri: string): string {
  return uri.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function getSpotlightMilvusClient(): Promise<MilvusClient | null> {
  const uri = resolveSpotlightMilvusUri();
  if (!uri) return null;
  if (client) return client;
  const { MilvusClient: MilvusCtor } = await import("@zilliz/milvus2-sdk-node");
  client = new MilvusCtor({
    address: normalizeMilvusAddress(uri),
    token: resolveSpotlightMilvusToken() || undefined,
  });
  await ensureSpotlightMilvusDatabase(client);
  return client;
}

export function resetSpotlightMilvusClientForTests(): void {
  client = null;
  dbReady = false;
}
