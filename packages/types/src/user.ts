import { z } from 'zod'

export const ZUserRole = z.enum(['admin', 'editor', 'viewer'])
export type TUserRole = z.infer<typeof ZUserRole>

export const ZUserProfile = z.object({
  id: z.string(),
  userId: z.string(),
  variables: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.string()).default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type TUserProfile = z.infer<typeof ZUserProfile>

export const ZUser = z.object({
  id: z.string(),
  email: z.string().email(),
  passwordHash: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: ZUserRole.default('viewer'),
  isActive: z.boolean().default(true),
  lastLoginAt: z.coerce.date().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  image: z.string().url().optional(),
  profile: ZUserProfile.optional(),
})
export type TUser = z.infer<typeof ZUser>

/** Safe user shape — never includes passwordHash */
export const ZPublicUser = ZUser.omit({ passwordHash: true })
export type TPublicUser = z.infer<typeof ZPublicUser>

export const ZRegisterBody = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
})
export type TRegisterBody = z.infer<typeof ZRegisterBody>

export const ZLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type TLoginBody = z.infer<typeof ZLoginBody>
