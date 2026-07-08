import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";
import {
  getSpotlightRedisClient,
  isSpotlightRedisConfigured,
  spotlightRedisKey,
} from "./redisClient.js";

export interface RedisExactMemoryStoreOptions {
  projectId: string;
  tenantId?: string;
  lruMax?: number;
}

function exactKey(
  projectId: string,
  tenantId: string | undefined,
  cacheKey: string,
): string {
  const tenant = tenantId?.trim() || "default";
  return spotlightRedisKey("gate", "exact", tenant, projectId, cacheKey);
}

function indexKey(projectId: string, tenantId: string | undefined): string {
  const tenant = tenantId?.trim() || "default";
  return spotlightRedisKey("gate", "exact-index", tenant, projectId);
}

/** L0 exact cache in Redis (SETEX + sorted index for LRU cap). */
export class RedisExactMemoryStore {
  readonly projectId: string;
  private readonly tenantId?: string;
  private readonly lruMax: number;

  constructor(options: RedisExactMemoryStoreOptions) {
    this.projectId = options.projectId;
    this.tenantId = options.tenantId;
    this.lruMax = options.lruMax ?? 500;
  }

  static isAvailable(): boolean {
    return isSpotlightRedisConfigured();
  }

  private ttlSec(entry: SpotlightMemoryEntry): number {
    const ttl = entry.ttlSec > 0 ? entry.ttlSec : 86_400;
    return Math.max(300, Math.min(ttl, 86_400));
  }

  async getExact(cacheKey: string): Promise<SpotlightMemoryEntry | null> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return null;
    const raw = await redis.get(
      exactKey(this.projectId, this.tenantId, cacheKey),
    );
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as SpotlightMemoryEntry;
      await redis.zadd(
        indexKey(this.projectId, this.tenantId),
        Date.now(),
        cacheKey,
      );
      return entry;
    } catch {
      return null;
    }
  }

  async hasExact(cacheKey: string): Promise<boolean> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return false;
    return (await redis.exists(
      exactKey(this.projectId, this.tenantId, cacheKey),
    )) === 1;
  }

  async putExact(
    cacheKey: string,
    entry: SpotlightMemoryEntry,
  ): Promise<void> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return;
    const key = exactKey(this.projectId, this.tenantId, cacheKey);
    const ttl = this.ttlSec(entry);
    await redis.set(key, JSON.stringify(entry), "EX", ttl);
    const index = indexKey(this.projectId, this.tenantId);
    await redis.zadd(index, Date.now(), cacheKey);
    const count = await redis.zcard(index);
    if (count > this.lruMax) {
      const evictCount = count - this.lruMax;
      const staleKeys = await redis.zrange(index, 0, evictCount - 1);
      if (staleKeys.length) {
        const pipeline = redis.pipeline();
        for (const staleCacheKey of staleKeys) {
          pipeline.del(exactKey(this.projectId, this.tenantId, staleCacheKey));
          pipeline.zrem(index, staleCacheKey);
        }
        await pipeline.exec();
      }
    }
  }

  async touch(entryId: string): Promise<void> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return;
    const index = indexKey(this.projectId, this.tenantId);
    const cacheKeys = await redis.zrange(index, 0, -1);
    for (const cacheKey of cacheKeys) {
      const key = exactKey(this.projectId, this.tenantId, cacheKey);
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as SpotlightMemoryEntry;
        if (entry.id !== entryId) continue;
        entry.hitCount += 1;
        entry.lastHitAt = Date.now();
        const ttl = await redis.ttl(key);
        if (ttl > 0) {
          await redis.set(key, JSON.stringify(entry), "EX", ttl);
        } else {
          await redis.set(key, JSON.stringify(entry), "EX", this.ttlSec(entry));
        }
        await redis.zadd(index, Date.now(), cacheKey);
        return;
      } catch {
        continue;
      }
    }
  }

  async listEntries(limit = 50): Promise<SpotlightMemoryEntry[]> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return [];
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(500, Math.floor(limit)) : 50;
    const index = indexKey(this.projectId, this.tenantId);
    const cacheKeys = await redis.zrevrange(index, 0, safeLimit - 1);
    const entries: SpotlightMemoryEntry[] = [];
    for (const cacheKey of cacheKeys) {
      const raw = await redis.get(exactKey(this.projectId, this.tenantId, cacheKey));
      if (!raw) continue;
      try {
        entries.push(JSON.parse(raw) as SpotlightMemoryEntry);
      } catch {
        continue;
      }
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteEntry(entryId: string): Promise<boolean> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return false;
    const index = indexKey(this.projectId, this.tenantId);
    const cacheKeys = await redis.zrange(index, 0, -1);
    for (const cacheKey of cacheKeys) {
      const key = exactKey(this.projectId, this.tenantId, cacheKey);
      const raw = await redis.get(key);
      if (!raw) {
        await redis.zrem(index, cacheKey);
        continue;
      }
      try {
        const entry = JSON.parse(raw) as SpotlightMemoryEntry;
        if (entry.id !== entryId) continue;
        await redis.del(key);
        await redis.zrem(index, cacheKey);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async deleteAll(projectId: string): Promise<number> {
    if (projectId !== this.projectId) return 0;
    const redis = await getSpotlightRedisClient();
    if (!redis) return 0;
    const index = indexKey(this.projectId, this.tenantId);
    const cacheKeys = await redis.zrange(index, 0, -1);
    if (cacheKeys.length === 0) return 0;
    const pipeline = redis.pipeline();
    for (const cacheKey of cacheKeys) {
      pipeline.del(exactKey(this.projectId, this.tenantId, cacheKey));
      pipeline.zrem(index, cacheKey);
    }
    await pipeline.exec();
    return cacheKeys.length;
  }

  async count(): Promise<number> {
    const redis = await getSpotlightRedisClient();
    if (!redis) return 0;
    return redis.zcard(indexKey(this.projectId, this.tenantId));
  }
}
