import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe, type AuthUser } from '../api.ts'

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

  return <>{children(data.user)}</>
}
