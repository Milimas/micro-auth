/** Hand-maintained TypeScript types matching proto/auth.proto */

export interface ValidateSessionRequest {
  sessionId: string
}

export interface ValidateSessionResponse {
  valid: boolean
  userId: string
  role: string
  email: string
}

export interface CheckPermissionRequest {
  userId: string
  role: string
  action: string
  subject: string
  resourceAttributes: Record<string, string>
}

export interface CheckPermissionResponse {
  allowed: boolean
}
