import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// ioredis ESM typings can be awkward under our TS setup; use a runtime-any typed client here
let redisClient: any = null;

export function redis(): any | null {
  if (env.NODE_ENV === "test") return null;
  if (!redisClient) {
    const RedisCtor = (Redis as unknown as any);
    redisClient = new RedisCtor(env.REDIS_URL, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
    redisClient.on("error", (error: Error) => logger.warn({ error }, "Redis unavailable"));
  }
  return redisClient;
}

export async function getCachedJson<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
  const client = redis();
  if (!client) return factory();

  try {
    if (client.status === "wait") await client.connect();
    const cached = await client.get(key);
    if (cached) return JSON.parse(cached) as T;

    const value = await factory();
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    return value;
  } catch (error) {
    logger.warn({ error, key }, "Cache bypassed");
    return factory();
  }
}
