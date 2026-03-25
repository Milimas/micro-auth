import { Store, type SessionData } from 'express-session'
import type { MemoryLayer } from './layers/memory.js'
import type { RedisLayer } from './layers/redis.js'
import type { DbLayer } from './layers/db.js'

export interface TieredStoreOptions {
  ttlSeconds: number
  memoryTtlSeconds?: number
}

/**
 * Three-layer session store: L1 Memory → L2 Redis → L3 DB
 *
 * Read path:
 *   L1 hit → return immediately
 *   L1 miss → check L2 → if hit, warm L1 and return
 *   L2 miss → check L3 → if hit, warm L2 + L1 and return
 *
 * Write path: L3 first (durable), then L2, then L1 (fire-and-forget for L2/L1).
 * Invalidation (destroy): purge all three layers.
 */
export class TieredSessionStore extends Store {
  private readonly ttl: number
  private readonly memoryTtl: number

  constructor(
    private readonly memory: MemoryLayer,
    private readonly redis: RedisLayer,
    private readonly db: DbLayer,
    options: TieredStoreOptions,
  ) {
    super()
    this.ttl = options.ttlSeconds
    this.memoryTtl = options.memoryTtlSeconds ?? Math.min(options.ttlSeconds, 60)
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    this.getAsync(sid).then((s) => callback(null, s)).catch((err) => callback(err))
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    this.setAsync(sid, session)
      .then(() => callback?.())
      .catch((err) => callback?.(err))
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.destroyAsync(sid)
      .then(() => callback?.())
      .catch((err) => callback?.(err))
  }

  override touch(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    this.touchAsync(sid)
      .then(() => callback?.())
      .catch((err) => callback?.(err))
  }

  private async getAsync(sid: string): Promise<SessionData | null> {
    // L1
    const fromMemory = this.memory.get(sid)
    if (fromMemory) return fromMemory

    // L2
    const fromRedis = await this.redis.get(sid)
    if (fromRedis) {
      this.memory.set(sid, fromRedis, this.memoryTtl) // warm L1
      return fromRedis
    }

    // L3
    const fromDb = await this.db.get(sid)
    if (fromDb) {
      void this.redis.set(sid, fromDb, this.ttl) // warm L2 (fire-and-forget)
      this.memory.set(sid, fromDb, this.memoryTtl) // warm L1
    }
    return fromDb
  }

  private async setAsync(sid: string, session: SessionData): Promise<void> {
    // Write L3 first for durability
    await this.db.set(sid, session, this.ttl)
    // Then update L2 and L1 (fire-and-forget is fine here — L3 is authoritative)
    void this.redis.set(sid, session, this.ttl)
    this.memory.set(sid, session, this.memoryTtl)
  }

  private async destroyAsync(sid: string): Promise<void> {
    this.memory.delete(sid)
    await Promise.allSettled([this.redis.delete(sid), this.db.delete(sid)])
  }

  private async touchAsync(sid: string): Promise<void> {
    void this.redis.touch(sid, this.ttl)
    await this.db.touch(sid, this.ttl)
  }
}
