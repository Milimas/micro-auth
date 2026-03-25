import type { Request, Response, NextFunction } from 'express'
import { defineAbilityFor } from './ability.js'
import type { AppAction, AppSubject } from './ability.js'
import type { TUser } from '@fusion-d/types'

declare global {
  // Augmented by auth middleware in api/auth-api
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TUser
    }
  }
}

/**
 * Express middleware factory.
 * Reads req.user (set by upstream auth middleware), defines abilities, and
 * throws 403 if the action on the subject is not permitted.
 *
 * For ownership checks, pass a `getResource` function that extracts the
 * resource attributes from the request (e.g. reads req.params.id from db).
 */
export function requireAbility(
  action: AppAction,
  subject: AppSubject,
  getResource?: (req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const ability = defineAbilityFor(user)

    if (getResource) {
      const resource = await getResource(req)
      const subject_instance = Object.assign(
        Object.create({ __caslSubjectType__: subject }) as object,
        resource,
      ) as unknown as AppSubject
      if (!ability.can(action, subject_instance)) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    } else {
      if (!ability.can(action, subject)) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }

    next()
  }
}
