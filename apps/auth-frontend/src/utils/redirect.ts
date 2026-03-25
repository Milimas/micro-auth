const ALLOWED_ORIGINS: string[] = (import.meta.env['VITE_ALLOWED_REDIRECT_ORIGINS'] as string | undefined ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/**
 * Validates the ?redirect query param against an allowlist of origins.
 * Returns the safe redirect URL, or null if it would be an open redirect.
 */
export function getSafeRedirectUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('redirect')
  if (!redirect) return null

  try {
    const url = new URL(redirect)
    const isAllowed = ALLOWED_ORIGINS.some((origin) => {
      try {
        return new URL(origin).origin === url.origin
      } catch {
        return false
      }
    })
    return isAllowed ? redirect : null
  } catch {
    // Relative path — safe to allow
    return redirect.startsWith('/') ? redirect : null
  }
}

export function buildLoginUrl(redirectTo?: string): string {
  const base = import.meta.env['VITE_AUTH_FRONTEND_URL'] as string
  if (!redirectTo) return `${base}/login`
  return `${base}/login?redirect=${encodeURIComponent(redirectTo)}`
}
