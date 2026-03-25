import { Redis } from 'ioredis'
import type { SessionData } from 'express-session'

export class RedisLayer {
  private client: Redis

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })

    this.client.on('error', (err: unknown) => {
      // Log but don't crash — Redis is L2, the store degrades gracefully
      console.error('[session-store/redis] connection error:', err)
    })
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    await this.client.quit()
  }

  async get(sid: string): Promise<SessionData | null> {
    try {
      const raw = await this.client.get(this.key(sid))
      if (!raw) return null
      return JSON.parse(raw) as SessionData
    } catch {
      return null
    }
  }

  async set(sid: string, session: SessionData, ttlSeconds: number): Promise<void> {
    try {
      await this.client.setex(this.key(sid), ttlSeconds, JSON.stringify(session))
    } catch {
      // Swallow — degraded mode without Redis
    }
  }

  async delete(sid: string): Promise<void> {
    try {
      await this.client.del(this.key(sid))
    } catch {
      // Swallow
    }
  }

  async touch(sid: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(this.key(sid), ttlSeconds)
    } catch {
      // Swallow
    }
  }

  private key(sid: string): string {
    return `sess:${sid}`
  }
}
