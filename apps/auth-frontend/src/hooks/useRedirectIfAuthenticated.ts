import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api.ts'
import { getSafeRedirectUrl } from '../utils/redirect.ts'

/**
 * Checks if the user is already authenticated.
 * If so, redirects them to the safe redirect URL or VITE_DEFAULT_REDIRECT_URL.
 * Use in Login and Register pages to bounce logged-in users away.
 */
export function useRedirectIfAuthenticated() {
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  })

  useEffect(() => {
    if (!data) return
    const dest =
      getSafeRedirectUrl() ||
      (import.meta.env['VITE_DEFAULT_REDIRECT_URL'] as string | undefined)
    if (dest) window.location.href = dest
  }, [data])

  return { isLoading }
}
