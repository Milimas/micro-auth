export type {
  ValidateSessionRequest,
  ValidateSessionResponse,
  CheckPermissionRequest,
  CheckPermissionResponse,
} from './types.js'

export { createAuthClient, type AuthServiceClient } from './client.js'
export { addAuthService, type AuthServiceImplementation } from './server.js'
