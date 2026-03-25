import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api.ts'

export default function Logout() {
  const navigate = useNavigate()

  useEffect(() => {
    void logout()
      .catch(() => null)
      .finally(() => navigate('/login', { replace: true }))
  }, [navigate])

  return <p>Signing out…</p>
}
