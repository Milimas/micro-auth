import { z } from 'zod'

const ZConfig = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4001),
  GRPC_PORT: z.coerce.number().default(50051),

  // Session
  SESSION_SECRET: z.string().min(64, 'SESSION_SECRET must be at least 64 characters'),
  SESSION_TTL_SECONDS: z.coerce.number().default(86400), // 24h
  SESSION_COOKIE_NAME: z.string().default('sid'),

  // Database (auth)
  DB_TYPE: z.enum(['mongo', 'lowdb']).default('lowdb'),
  MONGO_URI: z.string().optional(),
  LOWDB_PATH: z.string().default('./data/auth.json'),

  // Redis
  REDIS_URL: z.string().default('redis://:redispassword@localhost:6379'),

  // Service auth (gRPC)
  SERVICE_JWT_SECRET: z.string().min(32, 'SERVICE_JWT_SECRET must be at least 32 characters'),

  // CORS
  ALLOWED_CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((v) => v.split(',').map((s) => s.trim())),
})

export type Config = z.infer<typeof ZConfig>

function loadConfig(): Config {
  const result = ZConfig.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return result.data
}

export const config = loadConfig()
