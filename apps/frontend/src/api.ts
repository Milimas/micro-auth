const API_BASE = import.meta.env['VITE_API_URL'] as string
const AUTH_BASE = import.meta.env['VITE_AUTH_API_URL'] as string
const AUTH_FRONTEND = import.meta.env['VITE_AUTH_FRONTEND_URL'] as string

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
}

export interface Graph {
  id: string
  userId: string
  name: string
  isPublic: boolean
  status: string
  variables: Record<string, unknown>
  secrets: Record<string, '****'>
  nodes: unknown[]
  connections: unknown[]
  createdAt: string
  updatedAt: string
}

export interface UserProfile {
  userId: string
  variables: Record<string, unknown>
  secrets: Record<string, '****'>
}

async function request<T>(base: string, path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })

  if (res.status === 401) {
    // Redirect to auth-frontend with current URL as redirect param
    window.location.href = `${AUTH_FRONTEND}/login?redirect=${encodeURIComponent(window.location.href)}`
    // Never resolves — page is navigating away
    return new Promise(() => undefined)
  }

  const body = await res.json() as Record<string, unknown>
  if (!res.ok) {
    throw new Error((body['error'] as string | undefined) ?? `HTTP ${res.status}`)
  }
  return body as T
}

// Auth
export function getMe(): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>(AUTH_BASE, '/auth/me')
}

// Graphs
export function listGraphs(): Promise<{ graphs: Graph[] }> {
  return request<{ graphs: Graph[] }>(API_BASE, '/graphs')
}

export function getGraph(id: string): Promise<{ graph: Graph }> {
  return request<{ graph: Graph }>(API_BASE, `/graphs/${id}`)
}

export function createGraph(data: { name: string; isPublic?: boolean }): Promise<{ graph: Graph }> {
  return request<{ graph: Graph }>(API_BASE, '/graphs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateGraph(
  id: string,
  data: Partial<Pick<Graph, 'name' | 'isPublic' | 'status' | 'variables' | 'nodes' | 'connections'>>,
): Promise<{ graph: Graph }> {
  return request<{ graph: Graph }>(API_BASE, `/graphs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteGraph(id: string): Promise<void> {
  return request<void>(API_BASE, `/graphs/${id}`, { method: 'DELETE' })
}

// Profile
export function getProfile(): Promise<{ profile: UserProfile }> {
  return request<{ profile: UserProfile }>(API_BASE, '/profile')
}

export function updateProfile(variables: Record<string, unknown>): Promise<{ profile: UserProfile }> {
  return request<{ profile: UserProfile }>(API_BASE, '/profile', {
    method: 'PATCH',
    body: JSON.stringify({ variables }),
  })
}
