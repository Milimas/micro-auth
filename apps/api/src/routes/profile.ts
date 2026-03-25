import { Router } from 'express'
import { z } from 'zod'
import type { IDatabase } from '@fusion-d/database'
import type { TUserProfile } from '@fusion-d/types'
import { requireAbility } from '@fusion-d/abac'
import type { Logger } from '@fusion-d/logger'

const ZUpdateProfileBody = z.object({
  variables: z.record(z.string(), z.unknown()).optional(),
})

export function createProfileRouter(db: IDatabase<TUserProfile>, logger: Logger): Router {
  const router = Router()

  /**
   * GET /profile
   * Returns the current user's profile (secrets are masked).
   */
  router.get('/', requireAbility('read', 'UserProfile'), async (req, res) => {
    const userId = req.user!.id
    let profile = await db.findOne({ userId } as Parameters<typeof db.findOne>[0])

    if (!profile) {
      // Create empty profile on first access
      profile = await db.create({
        userId,
        variables: {},
        secrets: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Omit<TUserProfile, 'id' | 'createdAt' | 'updatedAt'>)
    }

    // Mask secret values
    const maskedSecrets: Record<string, '****'> = {}
    for (const key of Object.keys(profile.secrets)) {
      maskedSecrets[key] = '****'
    }

    res.status(200).json({ profile: { ...profile, secrets: maskedSecrets } })
  })

  /**
   * PATCH /profile
   * Updates the user's profile variables (NOT secrets — separate secured endpoint).
   */
  router.patch('/', requireAbility('update', 'UserProfile'), async (req, res) => {
    const parsed = ZUpdateProfileBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() })
      return
    }

    const userId = req.user!.id
    let profile = await db.findOne({ userId } as Parameters<typeof db.findOne>[0])

    if (!profile) {
      profile = await db.create({
        userId,
        variables: parsed.data.variables ?? {},
        secrets: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Omit<TUserProfile, 'id' | 'createdAt' | 'updatedAt'>)
    } else {
      const updated = await db.update(profile.id, {
        variables: { ...profile.variables, ...(parsed.data.variables ?? {}) },
      })
      if (updated) profile = updated
    }

    logger.info({ userId }, 'Profile updated')

    const maskedSecrets: Record<string, '****'> = {}
    for (const key of Object.keys(profile.secrets)) {
      maskedSecrets[key] = '****'
    }

    res.status(200).json({ profile: { ...profile, secrets: maskedSecrets } })
  })

  return router
}
