import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getProfile } from '../api.ts'

export default function Profile() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  if (isLoading) return <p>Loading profile…</p>
  if (isError || !data) return <p>Failed to load profile. <Link to="/">Back</Link></p>

  const { profile } = data

  return (
    <div>
      <Link to="/">← Back to graphs</Link>
      <h1>Profile</h1>
      <section>
        <h2>Variables</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {JSON.stringify(profile.variables, null, 2)}
        </pre>
      </section>
      <section>
        <h2>Secrets</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflow: 'auto' }}>
          {JSON.stringify(profile.secrets, null, 2)}
        </pre>
        <small>Secret values are masked.</small>
      </section>
    </div>
  )
}
