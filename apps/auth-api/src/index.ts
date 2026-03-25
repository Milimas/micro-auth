import { config } from './config.js'
import { createServer } from './server.js'

const { app, logger } = await createServer(config)

const httpServer = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'auth-api started')
})

// Graceful shutdown
function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal')
  httpServer.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
  // Force-exit after 10s if graceful fails
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — exiting')
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection — exiting')
  process.exit(1)
})
