import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api.ts'
import { getSafeRedirectUrl } from '../utils/redirect.ts'

export default function Logout() {
  const navigate = useNavigate()

  useEffect(() => {
    void logout()
      .catch(() => null)
      .finally(() => {
        const dest = getSafeRedirectUrl()
        if (dest) {
          window.location.href = dest
        } else {
          navigate('/login', { replace: true })
        }
      })
  }, [navigate])

  return <p>Signing out…</p>
}
