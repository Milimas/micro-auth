# Frontend Auth Flows

Fusion-D has two frontends with different auth responsibilities:

- **`auth-frontend` (:5174)** — the authentication SPA. Hosts login, register, and logout pages. Has no protected content of its own; it exists solely to authenticate users and redirect them onward.
- **`frontend` (:5173)** — the main application SPA. Contains protected content. Delegates all authentication decisions to `auth-api` and redirects unauthenticated users to `auth-frontend`.

---

## Two AuthGuard Components — Opposite Roles

This is an important architectural distinction. Both frontends have a component called `AuthGuard`, but they enforce opposite invariants.

| | `auth-frontend` AuthGuard | `frontend` AuthGuard |
|---|---|---|
| **File** | `apps/auth-frontend/src/components/AuthGuard.tsx` | `apps/frontend/src/components/AuthGuard.tsx` |
| **Invariant** | If you **are** authenticated → redirect away | If you **are not** authenticated → block and redirect to login |
| **Use case** | Bounce already-logged-in users off auth pages | Gate protected app pages |
| **Children** | Renders children (the auth form) only when NOT authenticated | Renders children (the app content) only when authenticated; passes `user` object |
| **Redirect target** | `VITE_DEFAULT_REDIRECT_URL` or `?redirect` param | `auth-frontend/login?redirect=<current URL>` (via `api.ts` interceptor) |
| **Status in router** | **Active** — wraps `/login` and `/register` in `App.tsx` | **Active** — wraps all protected routes |

---

## Component Map

```mermaid
graph TD
    subgraph "auth-frontend"
        APP_AF[App.tsx<br/>BrowserRouter]
        GUARD_AF[AuthGuard.tsx<br/>bounces authenticated users]
        LOGIN[Login.tsx]
        REGISTER[Register.tsx]
        LOGOUT[Logout.tsx]
        REDIRECT[utils/redirect.ts<br/>getSafeRedirectUrl<br/>buildLoginUrl]
        API_AF[api.ts<br/>login · register · logout · getMe]

        APP_AF -->|wraps| GUARD_AF
        GUARD_AF --> LOGIN
        GUARD_AF --> REGISTER
        APP_AF --> LOGOUT
        GUARD_AF --> API_AF
        LOGIN --> API_AF
        REGISTER --> API_AF
        LOGOUT --> API_AF
        LOGIN --> REDIRECT
        REGISTER --> REDIRECT
        LOGOUT --> REDIRECT
    end

    subgraph "frontend"
        APP_FE[App.tsx]
        GUARD_FE[AuthGuard.tsx<br/>active · wraps protected routes]
        API_FE[api.ts<br/>getMe · 401 interceptor]

        APP_FE --> GUARD_FE
        GUARD_FE --> API_FE
    end

    API_AF -->|HTTP /auth/*| AUTH_API[auth-api :4001]
    API_FE -->|HTTP /auth/me| AUTH_API
```

---

## Login Flow

`AuthGuard` runs first on every render of `/login`. It calls `GET /auth/me` and redirects authenticated users before the login form ever appears.

```mermaid
flowchart TD
    A([User navigates to /login]) --> B[AuthGuard: useQuery getMe<br/>GET /auth/me · retry:false]
    B -->|isLoading| C[render Loading…]
    B -->|200 user exists| D[getSafeRedirectUrl<br/>or VITE_DEFAULT_REDIRECT_URL]
    D -->|has destination| E[window.location.href = dest<br/>bounce logged-in user]
    D -->|no destination| F[render nothing]
    B -->|401 not authenticated| G[render Login form via children]
    G --> H[user submits email + password]
    H --> I[POST /auth/login to auth-api]
    I -->|error 400 · 401 · 429| J[display error message]
    I -->|200 success| K[getSafeRedirectUrl<br/>or VITE_DEFAULT_REDIRECT_URL]
    K -->|has destination| L[window.location.href = dest]
    K -->|no destination| M[navigate to /]
```

The `?redirect` query param is read from the URL by `getSafeRedirectUrl()` and validated against `VITE_ALLOWED_REDIRECT_ORIGINS` before any redirect is followed (see [Open Redirect Defense](#open-redirect-defense) below).

---

## Register Flow

```mermaid
flowchart TD
    A([User navigates to /register]) --> B[AuthGuard: useQuery getMe<br/>GET /auth/me · retry:false]
    B -->|isLoading| C[render Loading…]
    B -->|200 already authed| D[redirect per getSafeRedirectUrl<br/>or VITE_DEFAULT_REDIRECT_URL]
    B -->|401| E[render Register form via children]
    E --> F[user submits firstName · lastName · email · password]
    F --> G[POST /auth/register to auth-api]
    G -->|error 400 · 409 · 429| H[display error message]
    G -->|201 success| I[getSafeRedirectUrl<br/>or VITE_DEFAULT_REDIRECT_URL]
    I -->|has destination| J[window.location.href = dest]
    I -->|no destination| K[navigate to /]
```

Password minimum length (12 characters) is enforced both client-side (`minLength={12}` on the input) and server-side (`ZRegisterBody` schema in `@fusion-d/types`).

---

## Logout Flow

```mermaid
flowchart TD
    A([User navigates to /logout]) --> B[useEffect fires immediately]
    B --> C[POST /auth/logout to auth-api]
    C -->|success or error — both handled| D[getSafeRedirectUrl]
    D -->|has destination| E[window.location.href = dest]
    D -->|no destination| F[navigate to /login replace]
```

The logout page renders "Signing out…" and calls the API in a `useEffect`. Errors from the logout call are swallowed (`.catch(() => null)`) because the session may already be invalid, and the user should be redirected regardless. `navigate('/login', { replace: true })` prevents the logout page from appearing in browser history.

`/logout` is **not** wrapped by `AuthGuard` — the logout route must be reachable regardless of auth state.

---

## auth-frontend AuthGuard

```mermaid
flowchart TD
    A([AuthGuard renders]) --> B[useQuery queryKey:me<br/>getMe → GET /auth/me<br/>retry:false]
    B -->|isLoading| C[render Loading… aria-busy]
    B -->|data present — user authenticated| D[getSafeRedirectUrl<br/>or VITE_DEFAULT_REDIRECT_URL]
    D -->|destination exists| E[window.location.href = dest]
    D -->|no destination| F[return null]
    B -->|401 — not authenticated| G[render children]
```

`retry: false` prevents TanStack Query's default three-retry behavior on a 401, which would add ~3 seconds of delay before the form appears.

The guard is mounted as a **children wrapper** in `App.tsx`:

```tsx
<Route path="/login"    element={<AuthGuard><Login /></AuthGuard>} />
<Route path="/register" element={<AuthGuard><Register /></AuthGuard>} />
```

Any future auth page (e.g. `/forgot-password`) gets the same protection by adding it under `<AuthGuard>` — no per-page hook call required.

---

## frontend AuthGuard (Protected Routes)

```mermaid
flowchart TD
    A([AuthGuard renders]) --> B[useQuery queryKey:me<br/>getMe → GET /auth/me<br/>retry:false]
    B -->|isLoading| C[render loading spinner]
    B -->|isError or no data| D[return null<br/>api.ts already redirected to login]
    B -->|data present| E[render children with user object<br/>children user => ReactNode]
```

The `frontend` `AuthGuard` uses a **render prop** pattern: `children` is a function that receives the authenticated `AuthUser`. This guarantees that any child component always has a non-null user object — no downstream null checks needed.

The redirect on 401 happens inside `apps/frontend/src/api.ts`, not inside `AuthGuard` itself:

```typescript
// apps/frontend/src/api.ts
if (res.status === 401) {
  window.location.href = `${AUTH_FRONTEND}/login?redirect=${encodeURIComponent(window.location.href)}`
  return new Promise(() => undefined) // never resolves — page navigating away
}
```

When `getMe` returns a 401, the fetch wrapper redirects the entire page to `auth-frontend/login?redirect=<current URL>`. By the time `AuthGuard` receives `isError: true`, the browser is already navigating away. `AuthGuard` returns `null` as a clean fallback.

---

## Open Redirect Defense

`apps/auth-frontend/src/utils/redirect.ts` contains the `getSafeRedirectUrl()` function, which validates the `?redirect` query param before any redirect is performed.

**Validation rules:**

1. If there is no `?redirect` param → return `null`.
2. If the value is a valid absolute URL → check that its `origin` matches one of the entries in `VITE_ALLOWED_REDIRECT_ORIGINS`. If not allowed → return `null`.
3. If the value is not a valid URL (i.e., `new URL()` throws) → allow only if it starts with `/` (safe relative path). Anything else → return `null`.

```typescript
// apps/auth-frontend/src/utils/redirect.ts
export function getSafeRedirectUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('redirect')
  if (!redirect) return null
  try {
    const url = new URL(redirect)
    const isAllowed = ALLOWED_ORIGINS.some((origin) => {
      try { return new URL(origin).origin === url.origin } catch { return false }
    })
    return isAllowed ? redirect : null
  } catch {
    return redirect.startsWith('/') ? redirect : null
  }
}
```

`buildLoginUrl(redirectTo?)` in the same file constructs the login URL with the `?redirect` param properly `encodeURIComponent`-encoded. Use this function anywhere you need to send a user to the login page with a return destination.

> **Security:** `VITE_ALLOWED_REDIRECT_ORIGINS` is a comma-separated list of allowed origins (e.g. `http://localhost:5173,https://app.example.com`). An empty list means all absolute-URL redirects are blocked — only relative paths starting with `/` are allowed. This must be explicitly configured; there is no default that allows any external origin.

---

## API Client — auth-frontend

`apps/auth-frontend/src/api.ts` is a thin fetch wrapper. All requests include `credentials: 'include'` so the session cookie is sent and received across the origin boundary. The base URL is `VITE_AUTH_API_URL` (e.g. `http://localhost:4001`). There is no retry logic and no 401 interceptor — auth pages are not protected routes and a 401 is expected for unauthenticated users.
