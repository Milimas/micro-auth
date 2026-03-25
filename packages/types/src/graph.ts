import { z } from 'zod'

export const ZNodeType = z.enum([
  'trigger',
  'action',
  'agent',
  'agent-tool',
  'agent-memory',
  'agent-llm',
  'display',
  'utility',
])
export type TNodeType = z.infer<typeof ZNodeType>

export const ZGraphStatus = z.enum(['in-progress', 'running', 'stopped', 'error', 'paused'])
export type TGraphStatus = z.infer<typeof ZGraphStatus>

const ZPortDefinition = z.object({
  label: z.string(),
  isConnectable: z.boolean().optional(),
})
export type TPortDefinition = z.infer<typeof ZPortDefinition>

const ZNodeData = z.object({
  name: z.string(),
  label: z.string(),
  defaultOutput: z.unknown().optional(),
  inputs: z.record(z.string(), ZPortDefinition),
  outputs: z.record(z.string(), ZPortDefinition),
  parameters: z.record(z.string(), z.unknown()),
})

/** passthrough keeps it a ZodObject (supports .omit/.extend) while allowing extra fields at runtime */
export const ZGraphNode = z
  .object({
    id: z.string(),
    type: ZNodeType,
    inputs: z.record(z.string(), ZPortDefinition).optional(),
    outputs: z.record(z.string(), ZPortDefinition).optional(),
    data: ZNodeData,
  })
  .passthrough()
export type TGraphNode = z.infer<typeof ZGraphNode> & { [x: string]: unknown }

export const ZGraphConnection = z
  .object({
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string(),
    targetHandle: z.string(),
  })
  .passthrough()
export type TGraphConnection = z.infer<typeof ZGraphConnection> & { [x: string]: unknown }

const ZGraphBase = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().min(1).max(200),
  isPublic: z.boolean().default(false),
  variables: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.string().optional()),
  nodes: z.array(ZGraphNode),
  connections: z.array(ZGraphConnection),
  status: ZGraphStatus.default('stopped'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const ZGraph = ZGraphBase.passthrough()
export type TGraph = z.infer<typeof ZGraphBase> & { [x: string]: unknown }

/** Graph shape returned to clients — secrets are masked */
export const ZPublicGraph = ZGraphBase.omit({ secrets: true })
  .extend({ secrets: z.record(z.string(), z.literal('****')) })
  .passthrough()
export type TPublicGraph = z.infer<typeof ZPublicGraph> & { [x: string]: unknown }

export const ZCreateGraphBody = z.object({
  name: z.string().min(1).max(200),
  isPublic: z.boolean().optional().default(false),
  variables: z.record(z.string(), z.unknown()).optional().default({}),
  nodes: z.array(ZGraphNode).optional().default([]),
  connections: z.array(ZGraphConnection).optional().default([]),
})
export type TCreateGraphBody = z.infer<typeof ZCreateGraphBody>

export const ZUpdateGraphBody = ZCreateGraphBody.partial().extend({
  status: ZGraphStatus.optional(),
  secrets: z.record(z.string(), z.string().optional()).optional(),
})
export type TUpdateGraphBody = z.infer<typeof ZUpdateGraphBody>
