import * as grpc from '@grpc/grpc-js'
import { getAuthServiceDefinition } from './loader.js'
import type {
  ValidateSessionRequest,
  ValidateSessionResponse,
  CheckPermissionRequest,
  CheckPermissionResponse,
} from './types.js'

type UnaryHandler<Req, Res> = (
  call: grpc.ServerUnaryCall<Req, Res>,
  callback: grpc.sendUnaryData<Res>,
) => void

export interface AuthServiceImplementation {
  validateSession: UnaryHandler<ValidateSessionRequest, ValidateSessionResponse>
  checkPermission: UnaryHandler<CheckPermissionRequest, CheckPermissionResponse>
}

/**
 * Registers the AuthService implementation on a gRPC server.
 * The interceptor validates the x-service-token metadata header.
 *
 * @param tokenVerifier  Optional custom verifier (token, secret) => boolean.
 *                       Defaults to plain string equality. Pass a JWT verifier for production.
 */
export function addAuthService(
  server: grpc.Server,
  implementation: AuthServiceImplementation,
  serviceToken: string,
  tokenVerifier: (token: string, secret: string) => boolean = (token, secret) => token === secret,
): void {
  const wrappedImpl: AuthServiceImplementation = {
    validateSession: (call, callback) => {
      if (!verifyServiceToken(call.metadata, serviceToken, tokenVerifier)) {
        callback({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid service token' })
        return
      }
      implementation.validateSession(call, callback)
    },
    checkPermission: (call, callback) => {
      if (!verifyServiceToken(call.metadata, serviceToken, tokenVerifier)) {
        callback({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid service token' })
        return
      }
      implementation.checkPermission(call, callback)
    },
  }

  server.addService(
    getAuthServiceDefinition(),
    wrappedImpl as unknown as grpc.UntypedServiceImplementation,
  )
}

function verifyServiceToken(
  metadata: grpc.Metadata,
  expectedToken: string,
  verify: (token: string, secret: string) => boolean,
): boolean {
  const tokens = metadata.get('x-service-token')
  return tokens.length > 0 && verify(tokens[0] as string, expectedToken)
}
