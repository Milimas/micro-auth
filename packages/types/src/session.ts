import { z } from 'zod'

export const ZSession = z.object({
  id: z.string(),
  sid: z.string(),
  userId: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
})
export type TSession = z.infer<typeof ZSession>
