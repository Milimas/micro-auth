import { LRUCache } from 'lru-cache'
import type { SessionData } from 'express-session'

export class MemoryLayer {
  private cache: LRUCache<string, SessionData>

  constructor(ttlSeconds: number, maxItems = 1000) {
    this.cache = new LRUCache<string, SessionData>({
      max: maxItems,
      ttl: ttlSeconds * 1000,
    })
  }

  get(sid: string): SessionData | undefined {
    return this.cache.get(sid)
  }

  set(sid: string, session: SessionData, ttlSeconds?: number): void {
    this.cache.set(sid, session, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined)
  }

  delete(sid: string): void {
    this.cache.delete(sid)
  }

  has(sid: string): boolean {
    return this.cache.has(sid)
  }
}
