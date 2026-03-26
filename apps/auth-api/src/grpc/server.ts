import * as grpc from '@grpc/grpc-js'
import jwt from 'jsonwebtoken'
import { addAuthService } from '@fusion-d/proto'
import { checkPermission } from '@fusion-d/abac'
import type { AppAction, AppSubject } from '@fusion-d/abac'
import type { IDatabase } from '@fusion-d/database'
import type { TUser, TSession } from '@fusion-d/types'
import type { Logger } from '@fusion-d/logger'

export function createGrpcServer(
  userDb: IDatabase<TUser>,
  sessionDb: IDatabase<TSession>,
  serviceToken: string,
  logger: Logger,
): grpc.Server {
  const server = new grpc.Server()

  addAuthService(
    server,
    {
      validateSession: async (call, callback) => {
        try {
          const { sessionId } = call.request
          logger.debug({ sessionId }, 'gRPC: validateSession')

          const session = await sessionDb.findOne({ sid: sessionId } as Parameters<typeof sessionDb.findOne>[0])
          if (!session || session.expiresAt < new Date()) {
            callback(null, { valid: false, userId: '', role: '', email: '' })
            return
          }

          const user = await userDb.findById(session.userId)
          if (!user || !user.isActive) {
            callback(null, { valid: false, userId: '', role: '', email: '' })
            return
          }

          callback(null, {
            valid: true,
            userId: user.id,
            role: user.role,
            email: user.email,
          })
        } catch (err) {
          logger.error({ err }, 'gRPC validateSession error')
          callback({ code: grpc.status.INTERNAL, message: 'Internal error' })
        }
      },

      checkPermission: async (call, callback) => {
        try {
          const { userId, role: _role, action, subject, resourceAttributes } = call.request
          logger.debug({ userId, action, subject }, 'gRPC: checkPermission')

          const user = await userDb.findById(userId)
          if (!user || !user.isActive) {
            callback(null, { allowed: false })
            return
          }

          // Ensure role from token matches DB (DB is authoritative)
          const effectiveUser = { ...user, role: user.role }

          const resource = Object.keys(resourceAttributes).length > 0
            ? resourceAttributes as Record<string, unknown>
            : undefined

          const allowed = checkPermission(
            effectiveUser,
            action as AppAction,
            subject as AppSubject,
            resource,
          )

          logger.debug({ userId, action, subject, allowed }, 'gRPC: checkPermission result')
          callback(null, { allowed })
        } catch (err) {
          logger.error({ err }, 'gRPC checkPermission error')
          callback({ code: grpc.status.INTERNAL, message: 'Internal error' })
        }
      },
    },
    serviceToken,
    (token, secret) => { try { jwt.verify(token, secret); return true } catch { return false } },
  )

  return server
}

export function startGrpcServer(server: grpc.Server, port: number, logger: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          reject(err)
          return
        }
        logger.info({ port: boundPort }, 'gRPC server listening')
        resolve()
      },
    )
  })
}
