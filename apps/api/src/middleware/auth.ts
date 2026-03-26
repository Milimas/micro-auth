import type { Request, Response, NextFunction } from 'express'
import type { AuthServiceClient } from '@fusion-d/proto'
import type { TUser } from '@fusion-d/types'
import type { Logger } from '@fusion-d/logger'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TUser
    }
  }
}

/**
 * Validates the incoming session cookie against auth-api via gRPC.
 * Attaches a minimal req.user (id, email, role) on success.
 * Returns 401 if the session is missing or invalid.
 */
export function createAuthMiddleware(authClient: AuthServiceClient, logger: Logger) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawSid = req.cookies?.['sid'] as string | undefined
    if (!rawSid) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    // express-session signs cookies as "s:SID.HMAC" — strip prefix and remove the trailing .HMAC
    // Using last-dot split to correctly handle session IDs that contain dots
    const sid = rawSid.startsWith('s:') ? rawSid.slice(2).replace(/\.[^.]*$/, '') : rawSid

    try {
      const result = await authClient.validateSession({ sessionId: sid })
      if (!result.valid) {
        res.status(401).json({ error: 'Session expired or invalid' })
        return
      }

      // Attach minimal user to request — full user is fetched per-route when needed
      req.user = {
        id: result.userId,
        email: result.email,
        role: result.role as TUser['role'],
      } as TUser

      next()
    } catch (err) {
      logger.error({ err }, 'Failed to validate session via gRPC')
      res.status(503).json({ error: 'Authentication service unavailable' })
    }
  }
}
