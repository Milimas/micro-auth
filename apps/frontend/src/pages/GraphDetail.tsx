import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getGraph, updateGraph, deleteGraph, graphAction } from '../api.ts'
import type { AuthUser } from '../api.ts'

interface Props {
  user: AuthUser
}

const STATUS_COLOR: Record<string, string> = {
  running:     '#2a9d2a',
  stopped:     '#888',
  paused:      '#e07b00',
  'in-progress': '#1a6fcf',
  error:       '#c0392b',
}

export default function GraphDetail({ user }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editVars, setEditVars] = useState('')
  const [editError, setEditError] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', id],
    queryFn: () => getGraph(id!),
    enabled: !!id,
  })

  const actionMutation = useMutation({
    mutationFn: (action: Parameters<typeof graphAction>[1]) => graphAction(id!, action),
    onSuccess: (res) => {
      qc.setQueryData(['graph', id], res)
      void qc.invalidateQueries({ queryKey: ['graphs'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateGraph>[1]) => updateGraph(id!, payload),
    onSuccess: (res) => {
      qc.setQueryData(['graph', id], res)
      void qc.invalidateQueries({ queryKey: ['graphs'] })
      setEditing(false)
      setEditError('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteGraph(id!),
    onSuccess: () => void navigate('/'),
  })

  if (isLoading) return <p>Loading…</p>
  if (isError || !data) return <p>Graph not found. <Link to="/">Back</Link></p>

  const { graph } = data
  const isOwner = user.role === 'admin' || graph.userId === user.id
  const { status } = graph

  function openEdit() {
    setEditName(graph.name)
    setEditVars(JSON.stringify(graph.variables, null, 2))
    setEditError('')
    setEditing(true)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    let variables: Record<string, unknown>
    try { variables = JSON.parse(editVars) as Record<string, unknown> } catch {
      setEditError('Variables must be valid JSON')
      return
    }
    updateMutation.mutate({ name: editName.trim() || graph.name, variables })
  }

  const act = (a: Parameters<typeof graphAction>[1]) => () => actionMutation.mutate(a)
  const busy = actionMutation.isPending

  return (
    <div style={{ maxWidth: 720, padding: '16px 24px' }}>
      <Link to="/">← Graphs</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <h1 style={{ margin: 0, flex: 1 }}>{graph.name}</h1>
        <span style={{
          padding: '3px 10px',
          borderRadius: 12,
          background: STATUS_COLOR[status] ?? '#888',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {status}
        </span>
        {graph.isPublic && (
          <span style={{ padding: '3px 10px', borderRadius: 12, background: '#ddf', fontSize: 13 }}>
            published
          </span>
        )}
      </div>

      <p style={{ color: '#666', fontSize: 13, marginTop: 6 }}>
        owner: {graph.userId === user.id ? 'you' : graph.userId}
        {' · '}nodes: {graph.nodes.length}
        {' · '}connections: {graph.connections.length}
      </p>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {isOwner && (status === 'stopped' || status === 'paused') && (
          <button onClick={act('run')} disabled={busy}>▶ Run</button>
        )}
        {isOwner && status === 'running' && (
          <button onClick={act('pause')} disabled={busy}>⏸ Pause</button>
        )}
        {isOwner && status === 'paused' && (
          <button onClick={act('resume')} disabled={busy}>↩ Resume</button>
        )}
        {isOwner && (status === 'running' || status === 'paused' || status === 'in-progress') && (
          <button onClick={act('stop')} disabled={busy}>⏹ Stop</button>
        )}
        {isOwner && !graph.isPublic && (
          <button onClick={act('publish')} disabled={busy}>🌐 Publish</button>
        )}
        {graph.isPublic && graph.userId !== user.id && (
          <button
            onClick={() => {
              actionMutation.mutate('import', {
                onSuccess: (res) => void navigate(`/graphs/${res.graph.id}`),
              })
            }}
            disabled={busy}
          >
            ⬇ Import
          </button>
        )}
        {isOwner && !editing && (
          <button onClick={openEdit}>✏ Edit</button>
        )}
        {isOwner && (
          <button
            onClick={() => { if (confirm('Delete this graph?')) deleteMutation.mutate() }}
            disabled={deleteMutation.isPending}
            style={{ color: '#c0392b' }}
          >
            🗑 Delete
          </button>
        )}
      </div>

      {actionMutation.isError && (
        <p role="alert" style={{ color: 'red', marginTop: 8 }}>
          {actionMutation.error instanceof Error ? actionMutation.error.message : 'Action failed'}
        </p>
      )}

      {/* ── Edit form ── */}
      {editing && (
        <form onSubmit={handleSave} style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 6 }}>
          <h3 style={{ margin: '0 0 12px' }}>Edit graph</h3>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box' }}
              required
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Variables (JSON)</label>
            <textarea
              value={editVars}
              onChange={(e) => setEditVars(e.target.value)}
              rows={6}
              style={{ width: '100%', fontFamily: 'monospace', boxSizing: 'border-box' }}
            />
          </div>
          {editError && <p role="alert" style={{ color: 'red' }}>{editError}</p>}
          {updateMutation.isError && (
            <p role="alert" style={{ color: 'red' }}>
              {updateMutation.error instanceof Error ? updateMutation.error.message : 'Save failed'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* ── Info ── */}
      <section style={{ marginTop: 20 }}>
        <h2>Variables</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {JSON.stringify(graph.variables, null, 2)}
        </pre>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2>Secrets</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {JSON.stringify(graph.secrets, null, 2)}
        </pre>
        <small>Secret values are masked. Use the API directly to update secrets.</small>
      </section>
    </div>
  )
}
