import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listGraphs, createGraph, deleteGraph } from '../api.ts'
import type { AuthUser } from '../api.ts'

interface Props {
  user: AuthUser
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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (newName.trim()) createMutation.mutate(newName.trim())
  }

  if (isLoading) return <p>Loading graphs…</p>

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Graphs</h1>
        <span>
          {user.firstName} {user.lastName} ·{' '}
          <a href={`${import.meta.env['VITE_AUTH_FRONTEND_URL'] as string}/logout`}>Sign out</a>
        </span>
      </header>

      <button onClick={() => setCreating((v) => !v)}>
        {creating ? 'Cancel' : '+ New graph'}
      </button>

      {creating && (
        <form onSubmit={handleCreate} style={{ marginTop: 8 }}>
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
            <p role="alert" style={{ color: 'red' }}>
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create graph'}
            </p>
          )}
        </form>
      )}

      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {(data?.graphs ?? []).map((graph) => (
          <li key={graph.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <Link to={`/graphs/${graph.id}`} style={{ flex: 1 }}>
              {graph.name}
            </Link>
            <span style={{ color: '#888', fontSize: 12 }}>{graph.status}</span>
            <button
              onClick={() => deleteMutation.mutate(graph.id)}
              disabled={deleteMutation.isPending}
              style={{ color: 'red' }}
            >
              Delete
            </button>
          </li>
        ))}
        {data?.graphs.length === 0 && <li>No graphs yet.</li>}
      </ul>
    </div>
  )
}
