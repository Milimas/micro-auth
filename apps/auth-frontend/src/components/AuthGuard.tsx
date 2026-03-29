import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api.ts'
import { getSafeRedirectUrl } from '../utils/redirect.ts'

interface Props {
  children: ReactNode
}

/**
 * Redirects already-authenticated users away from auth pages (login, register).
 * If the user is logged in, they are sent to the safe ?redirect URL or the
 * configured VITE_DEFAULT_REDIRECT_URL. If neither is set, renders nothing.
 * If the user is not logged in, renders children as-is.
 * Do NOT wrap the logout route with this component.
 */
export default function AuthGuard({ children }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  })

  if (isLoading) return <div aria-busy="true">Loading…</div>

  if (data) {
    const redirect =
      getSafeRedirectUrl() ??
      (import.meta.env['VITE_DEFAULT_REDIRECT_URL'] as string | undefined) ??
      null
    if (redirect) {
      window.location.href = redirect
    }
    return null
  }

  return <>{children}</>
}
