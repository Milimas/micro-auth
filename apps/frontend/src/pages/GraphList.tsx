import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listGraphs, createGraph, deleteGraph, graphAction } from '../api.ts'
import type { AuthUser, Graph } from '../api.ts'

interface Props {
  user: AuthUser
}

const STATUS_COLOR: Record<string, string> = {
  running:       '#2a9d2a',
  stopped:       '#888',
  paused:        '#e07b00',
  'in-progress': '#1a6fcf',
  error:         '#c0392b',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 10,
      background: STATUS_COLOR[status] ?? '#888',
      color: '#fff',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

export default function GraphList({ user }: Props) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['graphs'],
    queryFn: listGraphs,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => createGraph({ name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['graphs'] })
      setNewName('')
      setCreating(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGraph(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['graphs'] }),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Parameters<typeof graphAction>[1] }) =>
      graphAction(id, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['graphs'] }),
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (newName.trim()) createMutation.mutate(newName.trim())
  }

  function isOwner(graph: Graph) {
    return user.role === 'admin' || graph.userId === user.id
  }

  if (isLoading) return <p>Loading graphs…</p>

  const graphs = data?.graphs ?? []

  return (
    <div style={{ maxWidth: 720, padding: '16px 24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Graphs</h1>
        <span style={{ fontSize: 13 }}>
          {user.firstName} {user.lastName} · <em>{user.role}</em>
          {' · '}
          <a href={`${import.meta.env['VITE_AUTH_FRONTEND_URL'] as string}/logout`}>Sign out</a>
        </span>
      </header>

      <button onClick={() => setCreating((v) => !v)} style={{ marginTop: 16 }}>
        {creating ? 'Cancel' : '+ New graph'}
      </button>

      {creating && (
        <form onSubmit={handleCreate} style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Graph name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>
          {createMutation.isError && (
            <span role="alert" style={{ color: 'red', fontSize: 13 }}>
              {createMutation.error instanceof Error ? createMutation.error.message : 'Failed'}
            </span>
          )}
        </form>
      )}

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {graphs.map((graph) => {
          const mine = isOwner(graph)
          const { status } = graph
          const busy = actionMutation.isPending && actionMutation.variables?.id === graph.id

          return (
            <li key={graph.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 0',
              borderBottom: '1px solid #eee',
              flexWrap: 'wrap',
            }}>
              {/* Name + public tag */}
              <Link to={`/graphs/${graph.id}`} style={{ flex: 1, minWidth: 100 }}>
                {graph.name}
                {graph.isPublic && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#1a6fcf' }}>public</span>
                )}
              </Link>

              <StatusBadge status={status} />

              {/* Quick lifecycle buttons — own graphs */}
              {mine && (status === 'stopped' || status === 'paused') && (
                <button
                  onClick={() => actionMutation.mutate({ id: graph.id, action: 'run' })}
                  disabled={busy}
                  style={{ fontSize: 12 }}
                >
                  ▶ Run
                </button>
              )}
              {mine && status === 'running' && (
                <button
                  onClick={() => actionMutation.mutate({ id: graph.id, action: 'pause' })}
                  disabled={busy}
                  style={{ fontSize: 12 }}
                >
                  ⏸ Pause
                </button>
              )}
              {mine && status === 'paused' && (
                <button
                  onClick={() => actionMutation.mutate({ id: graph.id, action: 'resume' })}
                  disabled={busy}
                  style={{ fontSize: 12 }}
                >
                  ↩ Resume
                </button>
              )}
              {mine && (status === 'running' || status === 'paused') && (
                <button
                  onClick={() => actionMutation.mutate({ id: graph.id, action: 'stop' })}
                  disabled={busy}
                  style={{ fontSize: 12 }}
                >
                  ⏹ Stop
                </button>
              )}

              {/* Import for others' published graphs */}
              {!mine && graph.isPublic && (
                <button
                  onClick={() => actionMutation.mutate({ id: graph.id, action: 'import' })}
                  disabled={busy}
                  style={{ fontSize: 12 }}
                >
                  ⬇ Import
                </button>
              )}

              {mine && (
                <button
                  onClick={() => { if (confirm(`Delete "${graph.name}"?`)) deleteMutation.mutate(graph.id) }}
                  disabled={deleteMutation.isPending}
                  style={{ color: '#c0392b', fontSize: 12 }}
                >
                  Delete
                </button>
              )}
            </li>
          )
        })}
        {graphs.length === 0 && <li style={{ color: '#888' }}>No graphs yet.</li>}
      </ul>

      {actionMutation.isError && (
        <p role="alert" style={{ color: 'red', fontSize: 13 }}>
          {actionMutation.error instanceof Error ? actionMutation.error.message : 'Action failed'}
        </p>
      )}
    </div>
  )
}
