import * as grpc from '@grpc/grpc-js'
import { getAuthServiceClient } from './loader.js'
import type {
  ValidateSessionRequest,
  ValidateSessionResponse,
  CheckPermissionRequest,
  CheckPermissionResponse,
} from './types.js'

export interface AuthServiceClient {
  validateSession(req: ValidateSessionRequest): Promise<ValidateSessionResponse>
  checkPermission(req: CheckPermissionRequest): Promise<CheckPermissionResponse>
}

/**
 * Creates a gRPC client for the AuthService.
 * @param address   e.g. "localhost:50051"
 * @param serviceToken  Shared HMAC-JWT for service-to-service auth
 */
export function createAuthClient(address: string, serviceToken: string): AuthServiceClient {
  const Client = getAuthServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const rawClient = new Client(address, grpc.credentials.createInsecure())

  function callWithToken<Req, Res>(method: string, request: Req): Promise<Res> {
    return new Promise((resolve, reject) => {
      const metadata = new grpc.Metadata()
      metadata.set('x-service-token', serviceToken)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      ;(rawClient as Record<string, (req: Req, meta: grpc.Metadata, cb: (err: grpc.ServiceError | null, res: Res) => void) => void>)[method]?.(
        request,
        metadata,
        (err: grpc.ServiceError | null, response: Res) => {
          if (err) reject(err)
          else resolve(response)
        },
      )
    })
  }

  return {
    validateSession: (req) =>
      callWithToken<ValidateSessionRequest, ValidateSessionResponse>('validateSession', req),
    checkPermission: (req) =>
      callWithToken<CheckPermissionRequest, CheckPermissionResponse>('checkPermission', req),
  }
}
