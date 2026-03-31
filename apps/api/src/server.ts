import express, { type Application } from 'express'
import cookieParser from 'cookie-parser'
import { LowDBAdapter, MongoDBAdapter } from '@fusion-d/database'
import { createLogger } from '@fusion-d/logger'
import type { TGraph, TUserProfile } from '@fusion-d/types'
import type { Config } from './config.js'
import { getAuthClient } from './grpc/client.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { createGraphsRouter } from './routes/graphs.js'
import { createProfileRouter } from './routes/profile.js'
import mongoose, { Schema } from 'mongoose'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import helmet from 'helmet'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'

export async function createServer(
  config: Config,
): Promise<{ app: Application; logger: ReturnType<typeof createLogger> }> {
  const logger = createLogger('api')

  // --- Database setup ---
  let graphDb
  let profileDb

  if (config.DB_TYPE === 'mongo') {
    if (!config.MONGO_URI) throw new Error('MONGO_URI is required when DB_TYPE=mongo')
    await mongoose.connect(config.MONGO_URI)
    logger.info('Connected to MongoDB (api)')

    const graphSchema = new Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true },
      name: { type: String, required: true },
      isPublic: { type: Boolean, required: true },
      variables: Schema.Types.Mixed,
      secrets: Schema.Types.Mixed,
      nodes: [Schema.Types.Mixed],
      connections: [Schema.Types.Mixed],
      status: {
        type: String,
        enum: ['in-progress', 'running', 'stopped', 'error', 'paused'],
        required: true,
      },
      createdAt: Date,
      updatedAt: Date,
    })
    const profileSchema = new Schema({
      id: { type: String, required: true, unique: true },
      userId: { type: String, required: true, unique: true },
      variables: Schema.Types.Mixed,
      secrets: Schema.Types.Mixed,
      createdAt: Date,
      updatedAt: Date,
    })
    graphDb = new MongoDBAdapter<TGraph>('graphs', graphSchema)
    profileDb = new MongoDBAdapter<TUserProfile>('profiles', profileSchema)
  } else {
    mkdirSync(dirname(config.LOWDB_PATH), { recursive: true })
    graphDb = await LowDBAdapter.create<TGraph>(config.LOWDB_PATH)
    profileDb = await LowDBAdapter.create<TUserProfile>(
      config.LOWDB_PATH.replace('.json', '-profiles.json'),
    )
    logger.info({ path: config.LOWDB_PATH }, 'Using LowDB (api)')
  }

  // --- gRPC auth client ---
  const authClient = getAuthClient(config.AUTH_API_GRPC_ADDRESS, config.SERVICE_JWT_SECRET)
  const authMiddleware = createAuthMiddleware(authClient, logger)

  // --- Express setup ---
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '5mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.ALLOWED_CORS_ORIGINS.includes(origin)) callback(null, true)
        else callback(new Error(`CORS: origin ${origin} not allowed`))
      },
      credentials: true,
    }),
  )

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 200,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  )

  // All routes below require authentication
  app.use('/graphs', authMiddleware, createGraphsRouter(graphDb, logger))
  app.use('/profile', authMiddleware, createProfileRouter(profileDb, logger))

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'api' })
  })

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ err }, 'Unhandled error')
      res.status(500).json({ error: 'Internal server error' })
    },
  )

  logger.info({ port: config.PORT }, 'api server ready')

  return { app, logger }
}
