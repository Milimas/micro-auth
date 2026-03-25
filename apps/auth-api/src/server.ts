import express, { type Application } from 'express'
import session from 'express-session'
import { LowDBAdapter, MongoDBAdapter } from '@fusion-d/database'
import { TieredSessionStore, MemoryLayer, RedisLayer, DbLayer } from '@fusion-d/session-store'
import { createLogger } from '@fusion-d/logger'
import type { TUser, TSession } from '@fusion-d/types'
import type { Config } from './config.js'
import { applySecurityMiddleware, generalLimiter } from './middleware/security.js'
import { createAuthRouter } from './routes/auth.js'
import { createGrpcServer, startGrpcServer } from './grpc/server.js'
import mongoose from 'mongoose'
import { Schema } from 'mongoose'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export async function createServer(config: Config): Promise<{ app: Application; logger: ReturnType<typeof createLogger> }> {
  const logger = createLogger('auth-api')

  // --- Database setup ---
  let userDb
  let sessionDb

  if (config.DB_TYPE === 'mongo') {
    if (!config.MONGO_URI) throw new Error('MONGO_URI is required when DB_TYPE=mongo')
    await mongoose.connect(config.MONGO_URI)
    logger.info('Connected to MongoDB (auth)')

    const userSchema = new Schema({}, { strict: false })
    const sessionSchema = new Schema({}, { strict: false })
    userDb = new MongoDBAdapter<TUser>('users', userSchema)
    sessionDb = new MongoDBAdapter<TSession>('sessions', sessionSchema)
  } else {
    mkdirSync(dirname(config.LOWDB_PATH), { recursive: true })
    userDb = await LowDBAdapter.create<TUser>(config.LOWDB_PATH)
    sessionDb = await LowDBAdapter.create<TSession>(config.LOWDB_PATH.replace('.json', '-sessions.json'))
    logger.info({ path: config.LOWDB_PATH }, 'Using LowDB (auth)')
  }

  // --- Session store setup ---
  const memoryLayer = new MemoryLayer(Math.min(config.SESSION_TTL_SECONDS, 60))
  const redisLayer = new RedisLayer(config.REDIS_URL)
  const dbLayer = new DbLayer(sessionDb)

  await redisLayer.connect().catch((err: unknown) => {
    logger.warn({ err }, 'Redis unavailable — sessions will fall back to DB only')
  })

  const store = new TieredSessionStore(memoryLayer, redisLayer, dbLayer, {
    ttlSeconds: config.SESSION_TTL_SECONDS,
  })

  // --- Express setup ---
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  applySecurityMiddleware(app, config.ALLOWED_CORS_ORIGINS)
  app.use(generalLimiter)

  app.use(
    session({
      name: config.SESSION_COOKIE_NAME,
      secret: config.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true, // reset TTL on every request
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: config.SESSION_TTL_SECONDS * 1000,
      },
    }),
  )

  // Routes
  app.use('/auth', createAuthRouter(userDb, logger))

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'auth-api' })
  })

  // Global error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error')
    res.status(500).json({ error: 'Internal server error' })
  })

  // --- gRPC server ---
  const grpcServer = createGrpcServer(userDb, sessionDb, config.SERVICE_JWT_SECRET, logger)
  await startGrpcServer(grpcServer, config.GRPC_PORT, logger)

  logger.info({ port: config.PORT }, 'auth-api HTTP server ready')

  return { app, logger }
}
