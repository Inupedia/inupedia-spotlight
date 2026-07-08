import type { Redis } from "ioredis";

let client: Redis | null = null;
let clientPromise: Promise<Redis | null> | null = null;

export function readSpotlightRedisKeyPrefix(): string {
  const raw = process.env.SPOTLIGHT_REDIS_KEY_PREFIX?.trim();
  return raw && raw.endsWith(":") ? raw : raw ? `${raw}:` : "spotlight:";
}

export function spotlightRedisKey(...parts: string[]): string {
  return `${readSpotlightRedisKeyPrefix()}${parts.join(":")}`;
}

export function resolveSpotlightRedisUrl(): string | null {
  const url = process.env.SPOTLIGHT_REDIS_URL?.trim();
  return url || null;
}

export function isSpotlightRedisConfigured(): boolean {
  return Boolean(resolveSpotlightRedisUrl());
}

/** Spotlight 专用 Redis（建议 DB index 2+，与 Yuxi ARQ/run 的 DB 0 隔离）。 */
export async function getSpotlightRedisClient(): Promise<Redis | null> {
  const url = resolveSpotlightRedisUrl();
  if (!url) return null;
  if (client) return client;
  if (!clientPromise) {
    clientPromise = (async () => {
      const { default: RedisCtor } = await import("ioredis");
      const redis = new RedisCtor(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      await redis.connect();
      client = redis;
      return redis;
    })().catch(() => null);
  }
  return clientPromise;
}

export async function closeSpotlightRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    clientPromise = null;
  }
}

export function resetSpotlightRedisClientForTests(): void {
  client = null;
  clientPromise = null;
}
