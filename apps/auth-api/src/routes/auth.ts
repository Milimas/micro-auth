import { Router } from 'express'
import argon2 from 'argon2'
import { ZRegisterBody, ZLoginBody } from '@fusion-d/types'
import type { IDatabase } from '@fusion-d/database'
import type { TUser } from '@fusion-d/types'
import type { Logger } from '@fusion-d/logger'
import { loginLimiter, registerLimiter } from '../middleware/security.js'

// Augment express-session with our custom session fields
declare module 'express-session' {
  interface SessionData {
    userId?: string
    role?: string
    email?: string
  }
}

export function createAuthRouter(db: IDatabase<TUser>, logger: Logger): Router {
  const router = Router()

  /**
   * POST /auth/register
   * Creates a new user account and opens a session.
   */
  router.post('/register', registerLimiter, async (req, res) => {
    const parsed = ZRegisterBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() })
      return
    }

    const { email, password, firstName, lastName } = parsed.data

    const existing = await db.findOne({ email } as Parameters<typeof db.findOne>[0])
    if (existing) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    })

    const now = new Date()
    const user = await db.create({
      email,
      passwordHash,
      firstName,
      lastName,
      role: 'viewer',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as Omit<TUser, 'id' | 'createdAt' | 'updatedAt'>)

    // Regenerate session to prevent fixation
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()))
    })

    req.session.userId = user.id
    req.session.role = user.role
    req.session.email = user.email

    logger.info({ userId: user.id }, 'User registered')

    const { passwordHash: _ph, ...publicUser } = user
    res.status(201).json({ user: publicUser })
  })

  /**
   * POST /auth/login
   * Authenticates credentials and creates a session.
   */
  router.post('/login', loginLimiter, async (req, res) => {
    const parsed = ZLoginBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() })
      return
    }

    const { email, password } = parsed.data

    const user = await db.findOne({ email } as Parameters<typeof db.findOne>[0])
    if (!user || !user.isActive) {
      // Constant-time response to prevent user enumeration
      await argon2.hash('dummy-constant-time-work')
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const valid = await argon2.verify(user.passwordHash, password)
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    // Regenerate session ID to prevent session fixation
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()))
    })

    req.session.userId = user.id
    req.session.role = user.role
    req.session.email = user.email

    // Update last login timestamp (fire-and-forget)
    void db.update(user.id, { lastLoginAt: new Date() })

    logger.info({ userId: user.id }, 'User logged in')

    const { passwordHash: _ph, ...publicUser } = user
    res.status(200).json({ user: publicUser })
  })

  /**
   * POST /auth/logout
   * Destroys the session across all store layers.
   */
  router.post('/logout', (req, res) => {
    const userId = req.session.userId
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, 'Failed to destroy session')
        res.status(500).json({ error: 'Logout failed' })
        return
      }
      res.clearCookie('sid')
      logger.info({ userId }, 'User logged out')
      res.status(200).json({ message: 'Logged out' })
    })
  })

  /**
   * GET /auth/me
   * Returns the current user if session is valid.
   */
  router.get('/me', async (req, res) => {
    const userId = req.session.userId
    if (typeof userId !== 'string') {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const user = await db.findById(userId)
    if (!user || !user.isActive) {
      req.session.destroy(() => null)
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const { passwordHash: _ph, ...publicUser } = user
    res.status(200).json({ user: publicUser })
  })

  /**
   * POST /auth/refresh
   * Extends the session TTL (touch).
   */
  router.post('/refresh', (req, res) => {
    const userId = req.session.userId
    if (typeof userId !== 'string') {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    req.session.touch()
    res.status(200).json({ message: 'Session refreshed' })
  })

  return router
}

