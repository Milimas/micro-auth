import { Router } from 'express'
import { ZCreateGraphBody, ZUpdateGraphBody } from '@fusion-d/types'
import type { TGraph, TPublicGraph } from '@fusion-d/types'
import type { IDatabase } from '@fusion-d/database'
import { requireAbility } from '@fusion-d/abac'
import type { Logger } from '@fusion-d/logger'

/** Express 5 types give string | string[] for params; we always use named route params */
function param(req: { params: Record<string, string | string[]> }, name: string): string {
  const v = req.params[name]
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function maskSecrets(graph: TGraph): TPublicGraph {
  const masked: Record<string, '****'> = {}
  for (const key of Object.keys(graph.secrets ?? {})) {
    masked[key] = '****'
  }
  return { ...graph, secrets: masked } as TPublicGraph
}

export function createGraphsRouter(db: IDatabase<TGraph>, logger: Logger): Router {
  const router = Router()

  /**
   * GET /graphs
   * Returns all graphs owned by the user (+ public graphs for editors/admins).
   */
  router.get(
    '/',
    requireAbility('read', 'Graph', async (req) => ({ userId: req.user!.id })),
    async (req, res) => {
      const user = req.user!
      let graphs: TGraph[]

      if (user.role === 'admin') {
        graphs = await db.find()
      } else {
        // Fetch own + public graphs
        const [own, publicGraphs] = await Promise.all([
          db.find({ userId: user.id } as Parameters<typeof db.find>[0]),
          db.find({ isPublic: true } as Parameters<typeof db.find>[0]),
        ])
        // Deduplicate
        const seen = new Set<string>()
        graphs = [...own, ...publicGraphs].filter((g) => {
          if (seen.has(g.id)) return false
          seen.add(g.id)
          return true
        })
      }

      res.status(200).json({ graphs: graphs.map(maskSecrets) })
    },
  )

  /**
   * GET /graphs/:id
   */
  router.get(
    '/:id',
    requireAbility('read', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) return {}
      return { userId: graph.userId, isPublic: graph.isPublic }
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      res.status(200).json({ graph: maskSecrets(graph) })
    },
  )

  /**
   * POST /graphs
   */
  router.post('/', requireAbility('create', 'Graph'), async (req, res) => {
    const parsed = ZCreateGraphBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() })
      return
    }

    const now = new Date()
    const graph = await db.create({
      ...parsed.data,
      userId: req.user!.id,
      secrets: {},
      status: 'stopped',
      createdAt: now,
      updatedAt: now,
    } as Omit<TGraph, 'id' | 'createdAt' | 'updatedAt'>)

    logger.info({ graphId: graph.id, userId: req.user!.id }, 'Graph created')
    res.status(201).json({ graph: maskSecrets(graph) })
  })

  /**
   * PUT /graphs/:id  — full update
   */
  router.put(
    '/:id',
    requireAbility('update', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const parsed = ZCreateGraphBody.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() })
        return
      }

      const updated = await db.update(param(req, 'id'), parsed.data)
      if (!updated) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }

      res.status(200).json({ graph: maskSecrets(updated) })
    },
  )

  /**
   * PATCH /graphs/:id  — partial update
   */
  router.patch(
    '/:id',
    requireAbility('update', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const parsed = ZUpdateGraphBody.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() })
        return
      }

      // Never let clients set raw secrets via PATCH — use a dedicated secrets endpoint
      const { secrets: _secrets, ...safeData } = parsed.data

      const updated = await db.update(param(req, 'id'), safeData)
      if (!updated) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }

      res.status(200).json({ graph: maskSecrets(updated) })
    },
  )

  /**
   * DELETE /graphs/:id
   */
  router.delete(
    '/:id',
    requireAbility('delete', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const deleted = await db.delete(param(req, 'id'))
      if (!deleted) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      logger.info({ graphId: req.params['id'], userId: req.user!.id }, 'Graph deleted')
      res.status(204).send()
    },
  )

  // ── Lifecycle actions ─────────────────────────────────────────────────────

  /**
   * POST /graphs/:id/run
   * Transitions: stopped | paused → running
   */
  router.post(
    '/:id/run',
    requireAbility('run', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      if (!['stopped', 'paused'].includes(graph.status)) {
        res.status(409).json({ error: `Cannot run a graph with status '${graph.status}'` })
        return
      }
      const updated = await db.update(param(req, 'id'), { status: 'running' })
      logger.info({ graphId: graph.id, userId: req.user!.id }, 'Graph started')
      res.status(200).json({ graph: maskSecrets(updated!) })
    },
  )

  /**
   * POST /graphs/:id/stop
   * Transitions: running | paused | in-progress → stopped
   */
  router.post(
    '/:id/stop',
    requireAbility('stop', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      if (!['running', 'paused', 'in-progress'].includes(graph.status)) {
        res.status(409).json({ error: `Cannot stop a graph with status '${graph.status}'` })
        return
      }
      const updated = await db.update(param(req, 'id'), { status: 'stopped' })
      logger.info({ graphId: graph.id, userId: req.user!.id }, 'Graph stopped')
      res.status(200).json({ graph: maskSecrets(updated!) })
    },
  )

  /**
   * POST /graphs/:id/pause
   * Transitions: running → paused
   */
  router.post(
    '/:id/pause',
    requireAbility('pause', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      if (graph.status !== 'running') {
        res.status(409).json({ error: `Cannot pause a graph with status '${graph.status}'` })
        return
      }
      const updated = await db.update(param(req, 'id'), { status: 'paused' })
      logger.info({ graphId: graph.id, userId: req.user!.id }, 'Graph paused')
      res.status(200).json({ graph: maskSecrets(updated!) })
    },
  )

  /**
   * POST /graphs/:id/resume
   * Transitions: paused → running
   */
  router.post(
    '/:id/resume',
    requireAbility('resume', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      if (graph.status !== 'paused') {
        res.status(409).json({ error: `Cannot resume a graph with status '${graph.status}'` })
        return
      }
      const updated = await db.update(param(req, 'id'), { status: 'running' })
      logger.info({ graphId: graph.id, userId: req.user!.id }, 'Graph resumed')
      res.status(200).json({ graph: maskSecrets(updated!) })
    },
  )

  /**
   * POST /graphs/:id/publish
   * Makes the graph publicly visible (isPublic: true).
   */
  router.post(
    '/:id/publish',
    requireAbility('publish', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId } : {}
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))
      if (!graph) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      if (graph.isPublic) {
        res.status(200).json({ graph: maskSecrets(graph) })
        return
      }
      const updated = await db.update(param(req, 'id'), { isPublic: true })
      logger.info({ graphId: graph.id, userId: req.user!.id }, 'Graph published')
      res.status(200).json({ graph: maskSecrets(updated!) })
    },
  )

  /**
   * POST /graphs/:id/import
   * Clones a published graph into the current user's account.
   * Requires the source graph to be public (isPublic: true).
   */
  router.post(
    '/:id/import',
    requireAbility('import', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))
      return graph ? { userId: graph.userId, isPublic: graph.isPublic } : {}
    }),
    async (req, res) => {
      const source = await db.findById(param(req, 'id'))
      if (!source) {
        res.status(404).json({ error: 'Graph not found' })
        return
      }
      const now = new Date()
      const copy = await db.create({
        name: `${source.name} (imported)`,
        userId: req.user!.id,
        isPublic: false,
        variables: source.variables,
        secrets: {},
        nodes: source.nodes,
        connections: source.connections,
        status: 'stopped',
        createdAt: now,
        updatedAt: now,
      } as Omit<TGraph, 'id' | 'createdAt' | 'updatedAt'>)
      logger.info({ sourceId: source.id, copyId: copy.id, userId: req.user!.id }, 'Graph imported')
      res.status(201).json({ graph: maskSecrets(copy) })
    },
  )

  return router
}
