const BASE = import.meta.env['VITE_AUTH_API_URL'] as string

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const body = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((body['error'] as string | undefined) ?? `HTTP ${res.status}`)
  }
  return body as T
}

export async function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(data: {
  email: string
  password: string
  firstName: string
  lastName: string
}): Promise<{ user: AuthUser }> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(data) })
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
}

export async function getMe(): Promise<{ user: AuthUser }> {
  return request('/auth/me')
}
