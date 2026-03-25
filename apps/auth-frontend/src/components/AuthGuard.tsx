import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe, type AuthUser } from '../api.ts'
import { getSafeRedirectUrl } from '../utils/redirect.ts'

interface Props {
  children: (user: AuthUser) => ReactNode
}

/**
 * Renders children only when the user has a valid session.
 * On 401, the api.ts fetch interceptor redirects to auth-frontend automatically.
 */
export default function AuthGuard({ children }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  })

  if (isLoading) return <div aria-busy="true">Loading…</div>
  if (isError || !data) return null // api.ts already redirected to login

  if (res.status === 200) {
    const redirect =
      getSafeRedirectUrl() || (import.meta.env['VITE_DEFAULT_REDIRECT_URL'] as string)
    if (redirect) {
      window.location.href = redirect
      return null;
    }
  }

  return <>{children(data.user)}</>
}
