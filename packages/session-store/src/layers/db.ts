import type { IDatabase } from '@fusion-d/database'
import type { TSession } from '@fusion-d/types'
import type { SessionData } from 'express-session'

export class DbLayer {
  constructor(private readonly db: IDatabase<TSession>) {}

  private async findBySid(sid: string): Promise<TSession | null> {
    return this.db.findOne({ sid } as Parameters<typeof this.db.findOne>[0])
  }

  async get(sid: string): Promise<SessionData | null> {
    const session = await this.findBySid(sid)
    if (!session) return null
    if (session.expiresAt < new Date()) {
      await this.db.delete(session.id).catch(() => null)
      return null
    }
    return session.data as unknown as SessionData
  }

  async set(sid: string, sessionData: SessionData, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    const userId = (sessionData as unknown as Record<string, unknown>)['userId'] as string | undefined
    const existing = await this.findBySid(sid)

    if (existing) {
      await this.db.update(existing.id, { data: sessionData as unknown as Record<string, unknown>, expiresAt })
    } else {
      await this.db.create({
        sid,
        userId: userId ?? '',
        data: sessionData as unknown as Record<string, unknown>,
        expiresAt,
      } as Omit<TSession, 'id' | 'createdAt' | 'updatedAt'>)
    }
  }

  async delete(sid: string): Promise<void> {
    const session = await this.findBySid(sid)
    if (session) await this.db.delete(session.id)
  }

  async touch(sid: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    const session = await this.findBySid(sid)
    if (session) await this.db.update(session.id, { expiresAt })
  }
}
