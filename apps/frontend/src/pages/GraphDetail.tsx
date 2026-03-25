import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getGraph } from '../api.ts'

export default function GraphDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', id],
    queryFn: () => getGraph(id!),
    enabled: !!id,
  })

  if (isLoading) return <p>Loading graph…</p>
  if (isError || !data) return <p>Graph not found. <Link to="/">Back</Link></p>

  const { graph } = data

  return (
    <div>
      <Link to="/">← Back to graphs</Link>
      <h1>{graph.name}</h1>
      <p>Status: <strong>{graph.status}</strong></p>
      <p>Nodes: {graph.nodes.length}</p>
      <p>Connections: {graph.connections.length}</p>
      <section>
        <h2>Variables</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {JSON.stringify(graph.variables, null, 2)}
        </pre>
      </section>
      <section>
        <h2>Secrets</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {JSON.stringify(graph.secrets, null, 2)}
        </pre>
        <small>Secret values are masked. Use the API directly to update secrets.</small>
      </section>
    </div>
  )
}
