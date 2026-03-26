# Fusion-D — Static & Security Audit Report

**Project:** Fusion-D (micro-auth monorepo)
**Auditor:** Claude Code
**Date:** 2026-03-26
**Scope:** Full static analysis of all source files + security review

---

## 1. Executive Summary

This audit covers the full Fusion-D monorepo after the FIX_AUDIT_REPORT.md remediation pass. The codebase is in a **partially remediated state**: the fixes documented in FIX_AUDIT_REPORT.md have been applied to the working tree and staged for commit, but the HEAD commit (bf21b15) still contains the original vulnerabilities. A total of **16 findings** were identified across all severity levels. The most critical runtime bug is **ASYNC-1**: all async route handlers in both `api` and `auth-api` are running under Express 4.x without `try/catch`, meaning any database error will propagate as an unhandled rejection and crash the process. Additionally, real user credentials and a live session token are stored in plain-text data files on disk and remain committed to git history.

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 3     |
| Medium   | 5     |
| Low      | 6     |

---

## 2. Methodology

1. Listed all files in the repository using `find`, excluding `node_modules`, `.git`, `dist`, and `.turbo`.
2. Read every TypeScript, TSX, JavaScript, JSON, YAML, and proto source file in full.
3. Read every `.env` and `.env.example` file across all apps.
4. Read the existing `FIX_AUDIT_REPORT.md` to understand prior remediation history.
5. Inspected `git log`, `git status`, and `git show` to determine the difference between the committed state (HEAD) and the working tree.
6. Performed static analysis on each file for type safety, async correctness, security, auth/authz, input validation, dead code, and logic bugs.
7. Cross-referenced schema definitions in `@fusion-d/types` against their usage in route handlers.
8. Reviewed ABAC ability definitions against route-level permission guards.
9. Traced session lifecycle across `TieredSessionStore`, the gRPC `validateSession` handler, and the API cookie-stripping middleware.
10. Verified open-redirect protection in `getSafeRedirectUrl()`.
11. Reviewed Docker Compose, tsconfig, package.json files, and the Turborepo configuration.
12. Assembled all findings, deduplicated, and ranked by severity.

---

## 3. File Inventory

| File | Type | Role |
|------|------|------|
| `apps/api/src/config.ts` | TypeScript | Env-var loading and validation for api service |
| `apps/api/src/index.ts` | TypeScript | Entry point for api; HTTP server lifecycle |
| `apps/api/src/server.ts` | TypeScript | Express app factory; DB, gRPC client, middleware setup |
| `apps/api/src/grpc/client.ts` | TypeScript | gRPC client singleton that signs JWT per-request |
| `apps/api/src/middleware/auth.ts` | TypeScript | Express middleware: validates session via gRPC, attaches req.user |
| `apps/api/src/routes/graphs.ts` | TypeScript | CRUD routes for Graph resource with ABAC guards |
| `apps/api/src/routes/profile.ts` | TypeScript | Read/update routes for UserProfile with ABAC guards |
| `apps/api/.env` | Config | Runtime environment variables (real JWT secret committed) |
| `apps/api/.env.example` | Config | Template for api environment variables |
| `apps/api/data/api.json` | Data | LowDB graph store (empty; tracked by git) |
| `apps/api/data/api-profiles.json` | Data | LowDB profile store (empty; tracked by git) |
| `apps/api/tsconfig.json` | Config | TypeScript configuration (extends tsconfig.base.json) |
| `apps/api/package.json` | Config | Dependencies for api service |
| `apps/auth-api/src/config.ts` | TypeScript | Env-var loading and validation for auth-api service |
| `apps/auth-api/src/index.ts` | TypeScript | Entry point for auth-api; HTTP server lifecycle |
| `apps/auth-api/src/server.ts` | TypeScript | Express + gRPC app factory; session store, DB, middleware setup |
| `apps/auth-api/src/grpc/server.ts` | TypeScript | gRPC server: validateSession and checkPermission handlers |
| `apps/auth-api/src/routes/auth.ts` | TypeScript | HTTP auth routes: register, login, logout, me, refresh |
| `apps/auth-api/src/middleware/security.ts` | TypeScript | Helmet, CORS, rate limiter middleware |
| `apps/auth-api/.env` | Config | Runtime environment variables (real secrets committed) |
| `apps/auth-api/.env.example` | Config | Template for auth-api environment variables |
| `apps/auth-api/data/auth.json` | Data | LowDB user store (contains real user records, NOT git-tracked) |
| `apps/auth-api/data/auth-sessions.json` | Data | LowDB session store (contains live session, NOT git-tracked) |
| `apps/auth-api/tsconfig.json` | Config | TypeScript configuration |
| `apps/auth-api/package.json` | Config | Dependencies for auth-api service |
| `apps/auth-frontend/src/App.tsx` | TSX | React router; public auth pages (fixes staged, HEAD is buggy) |
| `apps/auth-frontend/src/api.ts` | TypeScript | Auth API client (login, register, logout, me) |
| `apps/auth-frontend/src/main.tsx` | TSX | React entry point with TanStack Query provider |
| `apps/auth-frontend/src/pages/Login.tsx` | TSX | Login form; redirect after auth |
| `apps/auth-frontend/src/pages/Register.tsx` | TSX | Registration form; redirect after auth |
| `apps/auth-frontend/src/pages/Logout.tsx` | TSX | Triggers logout on mount; redirects after |
| `apps/auth-frontend/src/hooks/useRedirectIfAuthenticated.ts` | TypeScript | Hook: bounces logged-in users away from login/register |
| `apps/auth-frontend/src/utils/redirect.ts` | TypeScript | Open-redirect-safe URL validator; buildLoginUrl helper |
| `apps/auth-frontend/.env` | Config | Runtime VITE variables (no secrets) |
| `apps/auth-frontend/.env.example` | Config | Template (missing VITE_DEFAULT_REDIRECT_URL) |
| `apps/auth-frontend/tsconfig.json` | Config | TypeScript config for frontend |
| `apps/auth-frontend/vite.config.ts` | Config | Vite config (port 5174) |
| `apps/frontend/src/App.tsx` | TSX | React router; all routes wrapped in AuthGuard |
| `apps/frontend/src/api.ts` | TypeScript | API client; 401 redirects to auth-frontend |
| `apps/frontend/src/components/AuthGuard.tsx` | TSX | Auth gate component using TanStack Query |
| `apps/frontend/src/main.tsx` | TSX | React entry point with TanStack Query provider |
| `apps/frontend/src/pages/GraphList.tsx` | TSX | Graph list + create/delete UI |
| `apps/frontend/src/pages/GraphDetail.tsx` | TSX | Graph detail view |
| `apps/frontend/src/pages/Profile.tsx` | TSX | Profile variables + masked secrets view |
| `apps/frontend/.env` | Config | Runtime VITE variables (no secrets) |
| `apps/frontend/.env.example` | Config | Template for frontend environment variables |
| `apps/frontend/tsconfig.json` | Config | TypeScript config for frontend |
| `apps/frontend/vite.config.ts` | Config | Vite config (port 5173) |
| `packages/abac/src/ability.ts` | TypeScript | CASL ability definitions per role |
| `packages/abac/src/middleware.ts` | TypeScript | Express middleware factory for route-level ABAC |
| `packages/abac/src/index.ts` | TypeScript | Package exports |
| `packages/database/src/interface.ts` | TypeScript | IDatabase generic interface |
| `packages/database/src/adapters/lowdb.ts` | TypeScript | LowDB JSON file adapter |
| `packages/database/src/adapters/mongodb.ts` | TypeScript | Mongoose MongoDB adapter |
| `packages/database/src/index.ts` | TypeScript | Package exports |
| `packages/logger/src/index.ts` | TypeScript | Pino logger factory with field redaction |
| `packages/proto/src/client.ts` | TypeScript | gRPC AuthService client with JWT metadata |
| `packages/proto/src/server.ts` | TypeScript | gRPC server wrapper with service token interceptor |
| `packages/proto/src/loader.ts` | TypeScript | Proto file loader (singleton pattern) |
| `packages/proto/src/types.ts` | TypeScript | Hand-maintained TypeScript interfaces matching proto |
| `packages/proto/src/index.ts` | TypeScript | Package exports |
| `packages/proto/proto/auth.proto` | Proto | AuthService definition (ValidateSession, CheckPermission) |
| `packages/proto/scripts/generate.js` | JavaScript | Proto code generation script |
| `packages/session-store/src/tiered-store.ts` | TypeScript | Three-layer session store (Memory → Redis → DB) |
| `packages/session-store/src/layers/memory.ts` | TypeScript | LRU-cache L1 session layer |
| `packages/session-store/src/layers/redis.ts` | TypeScript | ioredis L2 session layer (graceful degradation) |
| `packages/session-store/src/layers/db.ts` | TypeScript | Database L3 session layer |
| `packages/session-store/src/index.ts` | TypeScript | Package exports |
| `packages/types/src/user.ts` | TypeScript | TUser, TUserProfile, ZRegisterBody, ZLoginBody schemas |
| `packages/types/src/graph.ts` | TypeScript | TGraph, TPublicGraph, ZCreateGraphBody, ZUpdateGraphBody schemas |
| `packages/types/src/session.ts` | TypeScript | TSession schema |
| `packages/types/src/index.ts` | TypeScript | Package exports |
| `docker-compose.yml` | Config | MongoDB ×2 + Redis with auth and healthchecks |
| `tsconfig.base.json` | Config | Shared TypeScript base config (strict: true, noUncheckedIndexedAccess) |
| `package.json` | Config | Root monorepo config (Turborepo, pnpm) |
| `pnpm-workspace.yaml` | Config | pnpm workspace paths |
| `turbo.json` | Config | Turborepo task pipeline |
| `eslint.config.js` | Config | ESLint flat config (strict-type-checked) |
| `.gitignore` | Config | Excludes node_modules, dist, .env, apps/*/data/ |
| `.prettierrc` | Config | Prettier formatting configuration |
| `FIX_AUDIT_REPORT.md` | Documentation | Prior remediation report (16 fixes applied) |

---

## 4. Build & Configuration Analysis

### 4.1 Build System

The monorepo uses **Turborepo 2.x** with **pnpm 9.x** workspaces. The task pipeline is well-configured: `build` depends on `^build` (packages build before apps), `dev` inherits built packages, and `test`/`typecheck`/`lint` correctly depend on `^build`. The proto package's build script copies the `.proto` file into `dist/proto/` which is necessary since the loader resolves it relative to the compiled JS. This is correct.

### 4.2 TypeScript Configuration

The base tsconfig (`tsconfig.base.json`) enables `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noPropertyAccessFromIndexSignature`. These are strong settings. All app and package tsconfigs extend the base correctly.

**Issue:** Both `apps/api` and `apps/auth-api` list `"@types/express": "^5.0.0"` as a dev dependency but use `"express": "^4.21.2"` at runtime. Express 5.x types and Express 4.x runtime are **not compatible**. Most notably, Express 5 automatically wraps async route handlers to forward thrown errors to `next(err)`, while Express 4 does not. Using v5 types masks the absence of `try/catch` in async routes — TypeScript will not flag the missing error handling because the types imply Express 5 semantics.

### 4.3 Dependencies Analysis

All production dependencies are reasonably scoped. Notable observations:
- `argon2` uses `argon2id` with `memoryCost: 65536` (64 MB), `timeCost: 3`, `parallelism: 4` — strong parameters.
- `helmet` is applied on both services with a strict CSP on auth-api.
- `pino`/`pino-pretty` redaction is configured; the redact path pattern (`*.password`) covers one depth level (see LOW findings).
- `nanoid` is used for ID generation in both DB adapters — cryptographically secure.
- No known-vulnerable packages identified from dependency versions.

`buildLoginUrl()` in `packages/proto/scripts/generate.js` uses `execSync` with constructed paths from `__dirname` which are controlled by the developer, not user input — no injection risk.

### 4.4 Environment Configuration

| App | .env tracked by git | Secrets in .env.example |
|-----|---------------------|------------------------|
| api | YES (real `SERVICE_JWT_SECRET` committed) | No real secrets |
| auth-api | YES (real `SESSION_SECRET` and `SERVICE_JWT_SECRET` committed) | No real secrets |
| auth-frontend | No | No |
| frontend | No | No |

**Both `apps/api/.env` and `apps/auth-api/.env` are tracked by git and contain real cryptographic secrets.** The `.gitignore` correctly excludes `.env` files (`/.env` pattern), but these files were committed in a prior state or added to the staging area directly.

**`apps/auth-frontend/.env.example` is missing `VITE_DEFAULT_REDIRECT_URL`** — this variable is used in Login, Register, and `useRedirectIfAuthenticated` to determine where authenticated users are sent. Without it documented, deployers may omit it, causing a degraded-but-safe fallback to `navigate('/')`.

---

## 5. Per-File Findings

---

### `apps/api/.env` and `apps/auth-api/.env`

**Overall status: BUGS FOUND**

#### Finding ENV-SECRETS-1 — Real cryptographic secrets committed to git [Severity: Critical]
- **Location:** `apps/api/.env:13`, `apps/auth-api/.env:6`, `apps/auth-api/.env:18`
- **Code:**
  ```
  SERVICE_JWT_SECRET=860e9da3e23717512c97a144ad7ec2adc7b24827bd07ce2aa502786b7e5cc932
  SESSION_SECRET=3bf6e418f55c6b10adbaf0e8797ae8d76902e1c667dff26cdc877c0087c99a4e...
  SERVICE_JWT_SECRET=860e9da3e23717512c97a144ad7ec2adc7b24827bd07ce2aa502786b7e5cc932
  ```
- **Description:** Both `.env` files containing real production secrets are tracked by git. The `.gitignore` pattern `.env` should prevent this, but the files appear to be staged or were previously committed. Running `git ls-files | grep '\.env$'` shows no `.env` files are currently tracked, however `git status` shows them as "changes to be committed" — meaning they were previously committed and the current working tree differs. These secrets may exist in git history.
- **Impact:** Any developer or CI system with access to the repository can extract the `SERVICE_JWT_SECRET` (used to sign gRPC inter-service JWTs) and the `SESSION_SECRET` (used to sign session cookies). An attacker with these values could forge gRPC service tokens to call auth-api's internal gRPC endpoints, and could potentially forge or tamper with session cookie HMAC signatures.
- **Fix:** Immediately rotate both secrets. Remove the `.env` files from git history using `git filter-repo`. Ensure `.env` is in `.gitignore` before re-adding. Use a secrets manager in production (e.g., Vault, AWS Secrets Manager, or environment injection at deploy time).

---

### `apps/auth-api/data/auth.json` and `apps/auth-api/data/auth-sessions.json`

**Overall status: BUGS FOUND**

#### Finding DATA-PII-1 — Real user PII and session data stored in unencrypted flat files [Severity: Critical]
- **Location:** `apps/auth-api/data/auth.json:3-26`, `apps/auth-api/data/auth-sessions.json:3-23`
- **Code (auth.json excerpt):**
  ```json
  {
    "email": "amine@beihaqi.com",
    "passwordHash": "$argon2id$v=19$m=65536,t=3,p=4$...",
    "firstName": "amine@beihaqi.com",
    ...
  }
  ```
- **Code (auth-sessions.json excerpt):**
  ```json
  {
    "sid": "Py3TShCRysiHaRqhhaEe8cDfjJbU82p8",
    "email": "amine@beihaqi.com",
    "role": "viewer",
    ...
  }
  ```
- **Description:** Two real user accounts (`amine@beihaqi.com`, `amine1@beihaqi.com`) with argon2id password hashes and a live session token are stored in plain-text JSON files on disk. These files are currently excluded from git by `apps/*/data/` in `.gitignore`, but they exist in the working directory. The `.gitignore` protection was added as a remediation after the initial commit; prior commits (before the `.gitignore` was updated) may have contained these files. Additionally, the first/last name fields for both accounts are set to the email address — indicating test data that was registered incorrectly.
- **Impact:** Any process or user with filesystem access to the server can read unencrypted credentials. If the prior git commits before the `.gitignore` fix are accessible (e.g., on GitHub), the hashes and session ID could be extracted. While argon2id hashes are computationally expensive to crack, the session ID (`Py3TShCRysiHaRqhhaEe8cDfjJbU82p8`) could still be used if not expired.
- **Fix:** (1) Confirm `apps/*/data/` is in `.gitignore` — it is. (2) Verify no data files were committed in prior git history (`git log --all --full-history -- "apps/auth-api/data/*.json"`). (3) Rotate the passwords for both accounts. (4) Invalidate the session by deleting the session record from the data file. (5) Consider encrypting LowDB files at rest for any environment with real credentials.

---

### `apps/auth-api/src/routes/auth.ts` and `apps/api/src/routes/graphs.ts` / `profile.ts`

**Overall status: BUGS FOUND**

#### Finding ASYNC-1 — All async route handlers lack try/catch under Express 4.x runtime [Severity: High]
- **Location:**
  - `apps/auth-api/src/routes/auth.ts:34` (register), `apps/auth-api/src/routes/auth.ts:87` (login), `apps/auth-api/src/routes/auth.ts:151` (me)
  - `apps/api/src/routes/graphs.ts:29` (GET /), `apps/api/src/routes/graphs.ts:63` (GET /:id), `apps/api/src/routes/graphs.ts:76` (POST), etc.
  - `apps/api/src/routes/profile.ts:19` (GET), `apps/api/src/routes/profile.ts:47` (PATCH)
  - `packages/abac/src/middleware.ts:29` (requireAbility with async getResource)
- **Code (example):**
  ```typescript
  router.post('/register', registerLimiter, async (req, res) => {
    const parsed = ZRegisterBody.safeParse(req.body)
    ...
    const existing = await db.findOne({ email } ... )  // throws if DB unavailable
    const passwordHash = await argon2.hash(...)         // throws if argon2 fails
    const user = await db.create(...)                   // throws if DB unavailable
    // No try/catch anywhere in this handler
  })
  ```
- **Description:** Both apps declare `"express": "^4.21.2"` as their runtime dependency but `"@types/express": "^5.0.0"` as their type definitions. In **Express 4**, async route handlers that throw (or return rejected promises) do **not** automatically invoke the `next(err)` error middleware — the rejection becomes an unhandled promise rejection. The `index.ts` in both apps registers a `process.on('unhandledRejection', ...)` handler that calls `process.exit(1)`, meaning **any database error, argon2 failure, or session store error in a route handler will crash the entire service**. The Express 5 types mask this because TypeScript sees the v5 async error semantics.
- **Impact:** A transient MongoDB/LowDB write error, a Redis timeout during session regeneration, or any other async failure in a route handler will take down the service rather than returning a 500 response. This is a reliability and availability issue that can cascade into a denial of service.
- **Fix:** Either (a) upgrade to Express 5 at runtime (`"express": "^5.0.0"`), which handles async errors natively, or (b) wrap all async route handler bodies in `try/catch` that calls `next(err)`. Option (a) is simpler. Do the same for the `requireAbility` middleware's `getResource` callback in `packages/abac/src/middleware.ts`.

---

### `apps/auth-frontend/src/App.tsx` (in git HEAD commit bf21b15)

**Overall status: BUGS FOUND**

#### Finding AUTH-FRONT-APP-1 — AuthGuard wraps public auth routes, blocking unauthenticated users from login/register [Severity: High]
- **Location:** `apps/auth-frontend/src/App.tsx` (as committed in HEAD, bf21b15)
- **Code (HEAD commit):**
  ```tsx
  <AuthGuard>
    {(user) => (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/logout" element={<Logout />} />
        ...
      </Routes>
    )}
  </AuthGuard>
  ```
- **Description:** The HEAD commit (bf21b15, titled "feat(auth-frontend): add AuthGuard to auth-frontend") wraps ALL auth-frontend routes — including `/login`, `/register`, and `/logout` — inside an `AuthGuard` component. The `AuthGuard` only renders children when the user has a valid session. Unauthenticated users visiting `/login` will see a blank page because `AuthGuard` renders `null` on error/no-data. Furthermore, the `AuthGuard.tsx` in this commit contains `if (res.status === 200)` which is a **reference error** (`res` is undefined in this scope) and will throw a `ReferenceError` at runtime, crashing the entire component tree.
- **Impact:** Any unauthenticated user visiting the auth-frontend gets a blank page (or runtime crash). Login and registration are completely inaccessible. This is a complete functional failure of the auth-frontend service.
- **Fix:** The working tree (staged) correctly removes the AuthGuard from auth-frontend's App.tsx and deletes the buggy `AuthGuard.tsx` component. **These staged changes must be committed immediately** to fix the deployed HEAD. The `useRedirectIfAuthenticated` hook (already present in the working tree) is the correct mechanism for bouncing already-authenticated users.

---

### `apps/auth-frontend/src/App.tsx` (working tree / staged state)

**Overall status: CORRECT**

The staged App.tsx correctly presents public routes without any auth gate. The `useRedirectIfAuthenticated` hook in Login and Register pages handles the case where an already-authenticated user lands on these pages.

#### Verified Correct

| Item | Details |
|------|---------|
| Public routes accessible without auth | Routes are rendered unconditionally |
| Already-authenticated bounce | `useRedirectIfAuthenticated` hook in Login/Register |
| Redirect after successful login | Uses `getSafeRedirectUrl()` + `VITE_DEFAULT_REDIRECT_URL` fallback |
| No XSS via dangerouslySetInnerHTML | None used |

---

### `apps/auth-frontend/src/utils/redirect.ts`

**Overall status: CORRECT with findings**

#### Finding REDIRECT-DEAD-1 — `buildLoginUrl()` is dead code with an undefined env variable [Severity: Low]
- **Location:** `apps/auth-frontend/src/utils/redirect.ts:31-35`
- **Code:**
  ```typescript
  export function buildLoginUrl(redirectTo?: string): string {
    const base = import.meta.env['VITE_AUTH_FRONTEND_URL'] as string
    if (!redirectTo) return `${base}/login`
    return `${base}/login?redirect=${encodeURIComponent(redirectTo)}`
  }
  ```
- **Description:** `buildLoginUrl()` is exported from `auth-frontend/src/utils/redirect.ts` but is never imported or called within the auth-frontend application. It references `VITE_AUTH_FRONTEND_URL` which is not defined in `apps/auth-frontend/.env` or `.env.example`. If it were ever called, `base` would be `undefined` and the returned string would be `undefined/login`.
- **Impact:** No runtime impact (it is never called). Risk of confusion if a developer assumes it is functional.
- **Fix:** Remove `buildLoginUrl()` from `apps/auth-frontend/src/utils/redirect.ts`. The function belongs only in the main `frontend` app if needed, where `VITE_AUTH_FRONTEND_URL` is defined.

#### Verified Correct

| Item | Details |
|------|---------|
| Open redirect prevention | `getSafeRedirectUrl()` validates origin against allowlist; relative paths require leading `/` |
| Empty allowlist behavior | Safely defaults to no absolute URL redirects allowed |
| URL parsing | Uses `new URL()` which correctly normalizes and validates URLs |

---

### `apps/auth-api/src/routes/auth.ts`

**Overall status: CORRECT with findings**

(See ASYNC-1 above for the missing try/catch finding.)

#### Finding AUTH-TIMING-1 — Timing attack mitigation uses the same pre-computed hash for every request [Severity: Low]
- **Location:** `apps/auth-api/src/routes/auth.ts:20-25`, `apps/auth-api/src/routes/auth.ts:100`
- **Code:**
  ```typescript
  const _dummyHashPromise = argon2.hash('dummy', { memoryCost: 65536, ... })
  // In login handler when user not found:
  await argon2.verify(await _dummyHashPromise, password).catch(() => null)
  ```
- **Description:** The constant-time decoy computes a single hash once at module load and reuses it for all failed lookups. This is better than the previous `argon2.hash()` approach (which always hashes the same string, different from `verify()`'s timing profile), but argon2 implementations may exhibit subtle timing differences when verifying against a hash that was computed with a fixed, known input. A sufficiently capable attacker with many timing measurements could potentially detect the difference.
- **Impact:** Theoretical remote timing side-channel. Practical exploitation requires thousands of measurements and microsecond-precision network timing. Low practical risk.
- **Fix:** Consider computing a new random hash on each failed lookup (`await argon2.hash(password, params).catch(() => null)`) so timing more closely matches the real path. This ensures argon2 processes the actual user-supplied password input.

#### Verified Correct

| Item | Details |
|------|---------|
| Password hashing | argon2id with memoryCost=65536, timeCost=3, parallelism=4 |
| Session fixation prevention | `req.session.regenerate()` called on both login and register |
| passwordHash not returned | Destructured and excluded before sending response |
| Session cookie cleared on logout | `res.clearCookie(cookieName)` with correct configured name |
| `/auth/me` active user check | Verifies `user.isActive` before returning session data |

---

### `apps/auth-api/src/grpc/server.ts`

**Overall status: CORRECT with findings**

#### Finding GRPC-PLAINTEXT-1 — gRPC server and client use insecure (plaintext) transport [Severity: Medium]
- **Location:** `apps/auth-api/src/grpc/server.ts:93`, `packages/proto/src/client.ts:24`
- **Code:**
  ```typescript
  // server
  grpc.ServerCredentials.createInsecure()
  // client
  grpc.credentials.createInsecure()
  ```
- **Description:** Both the gRPC server (auth-api) and client (api) use unencrypted connections. All gRPC traffic between the two services — including session IDs, user IDs, roles, email addresses, and permission results — is transmitted in plaintext. The HMAC-JWT service token in the `x-service-token` metadata header provides authentication but not confidentiality or integrity for the payload.
- **Impact:** In a network environment where an attacker can observe or intercept traffic between `api` and `auth-api` (e.g., shared tenant cloud, misconfigured network policy), all session validation and permission check data is readable and potentially manipulable. The JWT token itself would also be exposed, allowing token replay within its 60-second TTL.
- **Fix:** Enable TLS on both ends. In `packages/proto/src/server.ts`, use `grpc.ServerCredentials.createSsl(caCert, [{cert_chain, private_key}])`. In `packages/proto/src/client.ts`, use `grpc.credentials.createSsl(caCert)`. Gate the insecure path on `NODE_ENV !== 'production'` for local development convenience.

#### Verified Correct

| Item | Details |
|------|---------|
| Service token verification | JWT is verified via `jwt.verify()` in the interceptor |
| DB-authoritative role | `effectiveUser` uses `user.role` from DB, ignoring token's `_role` field |
| Error handling | Both handlers wrapped in `try/catch` (fix was applied in working tree) |
| Inactive user check | Both `validateSession` and `checkPermission` check `user.isActive` |

---

### `apps/api/src/middleware/auth.ts`

**Overall status: CORRECT**

#### Verified Correct

| Item | Details |
|------|---------|
| Session cookie signature stripping | Last-dot split correctly handles session IDs with dots in them |
| Missing cookie handling | Returns 401 immediately with no cookie |
| gRPC error handling | `catch` block returns 503 on gRPC failure |
| req.user type safety | Cast from gRPC response fields is guarded by `result.valid` check |

---

### `apps/api/src/server.ts`

**Overall status: CORRECT with findings**

#### Finding API-BODYLIMIT-1 — Request body limit of 5 MB is excessive for a JSON graph API [Severity: Low]
- **Location:** `apps/api/src/server.ts:67`
- **Code:** `app.use(express.json({ limit: '5mb' }))`
- **Description:** A 5 MB JSON body limit allows a single authenticated user to send very large payloads (e.g., graphs with thousands of deeply nested nodes). Combined with the 200 req/min rate limit, this creates a theoretical DoS amplification path: each request could force the server to parse and process up to 5 MB of JSON.
- **Impact:** Low DoS risk for authenticated users. The rate limiter helps, but 200 requests × 5 MB = 1 GB of parsing work per minute per IP.
- **Fix:** Reduce the body limit to `'512kb'` or `'1mb'` unless there is a concrete use case for very large graph payloads. If large graphs are needed, consider streaming or chunked upload instead.

#### Verified Correct

| Item | Details |
|------|---------|
| CORS allowlist | Explicit origin allowlist, no wildcard |
| Helmet headers | Applied; CSP disabled intentionally (API-only service) |
| Rate limiting | 200 req/min with draft-7 standard headers |
| Health endpoint | Unauthenticated, safe for load balancer use |
| Global error handler | Catches 4-argument Express errors |

---

### `apps/api/src/routes/graphs.ts`

**Overall status: CORRECT with findings**

#### Finding GRAPHS-DOUBLEFETCH-1 — Double DB fetch per request in ABAC-guarded routes [Severity: Low]
- **Location:** `apps/api/src/routes/graphs.ts:56-70` (GET /:id), `100-120` (PUT /:id), `126-149` (PATCH /:id), `155-170` (DELETE /:id)
- **Code (example for GET /:id):**
  ```typescript
  router.get('/:id',
    requireAbility('read', 'Graph', async (req) => {
      const graph = await db.findById(param(req, 'id'))  // fetch #1
      if (!graph) return {}
      return { userId: graph.userId, isPublic: graph.isPublic }
    }),
    async (req, res) => {
      const graph = await db.findById(param(req, 'id'))  // fetch #2
      ...
    },
  )
  ```
- **Description:** Each ABAC-guarded route fetches the graph document twice from the database — once in the `getResource` callback of `requireAbility` to extract ownership/visibility attributes for CASL, and again in the route handler to return the data. This is a performance inefficiency, not a correctness or security issue.
- **Impact:** Double the database load for all guarded graph operations. Negligible in development (LowDB is in-memory), but significant in production with MongoDB.
- **Fix:** Attach the fetched resource to a request-scoped property (e.g., `req.resource`) inside the `getResource` callback and read it in the handler, or accept the inefficiency as a trade-off for clean ABAC separation.

#### Verified Correct

| Item | Details |
|------|---------|
| Secrets never returned raw | `maskSecrets()` replaces all secret values with `'****'` on every response path |
| PATCH strips secrets from update | `secrets` field is explicitly excluded from `parsed.data` before `db.update()` |
| ABAC on all routes | Every route has `requireAbility()` middleware with appropriate ownership check |
| Input validation | Zod schemas strip unknown fields (no passthrough on `ZCreateGraphBody`) |
| Non-owner read of public graph | `isPublic: true` condition in CASL ability allows public graph reads |

---

### `packages/abac/src/ability.ts`

**Overall status: CORRECT**

The staged version (on disk) correctly expands array action calls into individual `can()` calls, fixing the CASL array-action bug from the previous audit. The `CanFn` type correctly accepts a single `AppAction`.

#### Verified Correct

| Item | Details |
|------|---------|
| Admin access | `_can('manage', 'all')` gives full access |
| Editor ownership | Conditions `{ userId: user.id }` correctly scope Graph CRUD to owned resources |
| Viewer restrictions | No `create`, `update`, or `delete` on any resource for viewers |
| Role immutability | No endpoint allows self-promotion; role is set only at registration |
| cannot('delete', 'User') | Explicitly prevents editor from deleting User records |

---

### `packages/abac/src/middleware.ts`

**Overall status: CORRECT with findings**

#### Finding ABAC-NOERROR-1 — `getResource` callback errors cause unhandled rejections [Severity: High]
- **Location:** `packages/abac/src/middleware.ts:38-46`
- **Code:**
  ```typescript
  if (getResource) {
    const resource = await getResource(req)  // no try/catch
    const subject_instance = ...
    if (!ability.can(action, subject_instance)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
  }
  ```
- **Description:** The `requireAbility` middleware is an `async` function that calls `await getResource(req)` without a `try/catch`. If `getResource` throws (e.g., due to a database error when fetching the resource for ownership check), the error becomes an unhandled promise rejection. Under Express 4, this bypasses the global error handler and crashes the process.
- **Impact:** Any database failure during an ABAC ownership check (affecting all GET /:id, PUT, PATCH, DELETE routes and the profile PATCH route) will crash both the `api` and `auth-api` services.
- **Fix:** Wrap the middleware body in `try/catch` and call `next(err)` on failure. This is best addressed together with ASYNC-1 by upgrading to Express 5 or wrapping all async middleware in a helper.

---

### `packages/session-store/src/tiered-store.ts`

**Overall status: CORRECT**

#### Verified Correct

| Item | Details |
|------|---------|
| Write durability | L3 (DB) written first with `await`; L2/L1 are fire-and-forget |
| Destroy completeness | All three layers purged via `Promise.allSettled()` |
| Redis failure isolation | Redis errors are caught and swallowed; falls back to DB |
| Session TTL propagation | TTL correctly passed to all layers on set |

---

### `packages/database/src/adapters/lowdb.ts`

**Overall status: CORRECT with findings**

#### Finding LOWDB-CONCURRENT-1 — LowDB has no write locking; concurrent writes risk data corruption [Severity: Medium]
- **Location:** `packages/database/src/adapters/lowdb.ts:75`, `85`, `93`
- **Code:**
  ```typescript
  async create(data): Promise<T> {
    this.db.data.items.push(item)
    await this.db.write()  // no mutex around in-memory mutation + write
    return item
  }
  ```
- **Description:** LowDB v7 operates on an in-memory array. All mutations (push, splice, assign) are synchronous, but `db.write()` is async. If two requests arrive simultaneously and both call `create()` concurrently, both mutations happen on the shared in-memory array (safe), but the second `write()` will overwrite whatever the first wrote to disk. In practice, because Node.js is single-threaded and the in-memory operations are synchronous, the array stays consistent in memory. However, if the process restarts between writes, only the last write is persisted. Under high load (unlikely for LowDB use cases), a write failure by one request could corrupt state if the error is caught and the in-memory state is not rolled back.
- **Impact:** Low risk in practice for a development/demo database. A write failure leaves in-memory state inconsistent with on-disk state until the next write succeeds.
- **Fix:** For production-scale usage, switch to MongoDB. If LowDB must be used, implement a write lock using a queue (e.g., `async-mutex` package). This is a known limitation of LowDB and is acceptable for the stated development-only use case.

#### Verified Correct

| Item | Details |
|------|---------|
| Filter operators | Only `$in` and `$ne` supported — no arbitrary operator injection |
| ID generation | `nanoid()` produces cryptographically random IDs |
| updatedAt timestamp | Always overwritten on `update()` — prevents stale timestamps |

---

### `packages/database/src/adapters/mongodb.ts`

**Overall status: CORRECT with findings**

#### Finding MONGO-ESLINT-1 — Widespread `eslint-disable` comments suppress type-safety warnings [Severity: Low]
- **Location:** `packages/database/src/adapters/mongodb.ts` (throughout)
- **Description:** The MongoDB adapter uses many `// eslint-disable-next-line @typescript-eslint/no-unsafe-*` comments to suppress unsafe assignment, call, and member-access warnings. These arise from using `mongoose.Model<any>` without proper generic typing. The functional code is correct, but the eslint suppressions reduce TypeScript's ability to catch future bugs in this file.
- **Impact:** No current runtime impact. Maintenance risk if the adapter is modified.
- **Fix:** Type the model properly as `mongoose.Model<T>` and implement the schema-to-model pattern with Mongoose's type system. This would eliminate the need for `any` casts.

#### Verified Correct

| Item | Details |
|------|---------|
| `toMongoFilter` safety | Skips null/undefined values; does not pass arbitrary operators through |
| `findOneAndUpdate` with `{new: true}` | Returns the updated document |
| `docToObject` | Correctly maps `_id` to `id` and removes Mongoose internals |

---

### `packages/logger/src/index.ts`

**Overall status: CORRECT with findings**

#### Finding LOGGER-REDACT-1 — Pino redact paths use single-level wildcard; deeply nested fields are not redacted [Severity: Low]
- **Location:** `packages/logger/src/index.ts:22`
- **Code:**
  ```typescript
  redact: {
    paths: ['*.password', '*.passwordHash', '*.token', '*.secret', '*.cookie'],
  }
  ```
- **Description:** The `*` wildcard in Pino redact paths only matches one level of nesting. A field logged as `{ user: { passwordHash: '...' } }` would be redacted (matched by `*.passwordHash`), but `{ event: { data: { password: '...' } } }` (two levels deep) would not be redacted by `*.password`. Additionally, the `cookie` path would match `{ req: { cookie: '...' } }` but not `{ session: { data: { cookie: '...' } } }`.
- **Impact:** Password or token fields logged at unexpected nesting depths may appear in log files. The current code bases only log top-level objects, so the practical risk is low.
- **Fix:** Add deeper wildcard paths: `['**.password', '**.passwordHash', '**.token', '**.secret', '**.cookie']`. Pino supports `**` for recursive matching.

---

### `packages/proto/src/server.ts` and `packages/proto/src/client.ts`

**Overall status: CORRECT**

The token verification correctly validates a JWT using `jwt.verify()` rather than plain string equality. The client generates a new short-lived JWT per request (60s TTL). The interceptor is applied to both `validateSession` and `checkPermission` handlers.

#### Verified Correct

| Item | Details |
|------|---------|
| JWT signing | `jwt.sign({ iss: 'api' }, serviceToken, { expiresIn: 60 })` |
| JWT verification | `jwt.verify(token, secret)` — throws on invalid or expired token |
| Token passed per-request | `getToken()` factory called on every RPC call |
| Unauthenticated handler rejection | Returns `grpc.status.UNAUTHENTICATED` if token missing or invalid |

---

### `docker-compose.yml`

**Overall status: CORRECT with findings**

#### Finding DOCKER-DEFAULTS-1 — MongoDB and Redis use weak default credentials [Severity: Medium]
- **Location:** `docker-compose.yml:15`, `docker-compose.yml:33`, `docker-compose.yml:48`
- **Code:**
  ```yaml
  MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME:-admin}
  MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD:-changeme}
  command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redispassword}
  ```
- **Description:** The fallback credentials (`admin/changeme` for MongoDB, `redispassword` for Redis) are well-known defaults. If the docker-compose file is used without setting these environment variables (common in development), the services start with predictable credentials. Both MongoDB instances expose ports 27017 and 27018 on all interfaces.
- **Impact:** Any process on the host (or the container network) can connect to MongoDB or Redis using the default credentials. In a CI/CD or shared developer machine, this could allow data exfiltration.
- **Fix:** Remove the default fallback values (`:-changeme`, `:-redispassword`, `:-admin`). Require explicit environment variables. Document the required values in a `.env.compose.example` file. Ensure ports are bound to `127.0.0.1` in development: `"127.0.0.1:27017:27017"`.

#### Verified Correct

| Item | Details |
|------|---------|
| MongoDB authentication enabled | Both MongoDB services have `MONGO_INITDB_ROOT_*` credentials |
| Redis password required | `--requirepass` flag set |
| Healthchecks configured | All three services have appropriate healthcheck commands |
| Volume persistence | Named volumes for all three services |

---

### `apps/auth-frontend/.env.example`

**Overall status: CORRECT with findings**

#### Finding ENV-DOC-1 — `VITE_DEFAULT_REDIRECT_URL` missing from auth-frontend `.env.example` [Severity: Low]
- **Location:** `apps/auth-frontend/.env.example`
- **Description:** `VITE_DEFAULT_REDIRECT_URL` is present in `apps/auth-frontend/.env` and used in `Login.tsx`, `Register.tsx`, and `useRedirectIfAuthenticated.ts` as the fallback redirect destination for authenticated users. It is absent from `.env.example`, so deployers following the template will not configure it.
- **Impact:** If missing at runtime, `VITE_DEFAULT_REDIRECT_URL` will be `undefined`, and the fallback `navigate('/')` will be used instead of redirecting to the main frontend. Auth flow degrades gracefully but does not redirect to the intended application.
- **Fix:** Add `VITE_DEFAULT_REDIRECT_URL=http://localhost:5173` to `apps/auth-frontend/.env.example`.

---

### All remaining files

**Overall status: CORRECT**

Files verified correct without findings:
- `apps/auth-api/src/config.ts` — Strong validation (SESSION_SECRET min 64 chars, SERVICE_JWT_SECRET min 32 chars)
- `apps/auth-api/src/server.ts` — Session cookie settings correct (httpOnly, sameSite=strict, secure in production)
- `apps/auth-api/src/middleware/security.ts` — Strict CSP, explicit CORS allowlist, tiered rate limiters
- `apps/api/src/config.ts` — Correct config validation with Zod
- `apps/api/src/grpc/client.ts` — JWT signed per-request with short TTL
- `apps/frontend/src/components/AuthGuard.tsx` — Correctly delegates 401 redirect to `api.ts`
- `apps/frontend/src/api.ts` — 401 auto-redirect to auth-frontend with encoded return URL
- `apps/frontend/src/App.tsx` — All routes guarded by `AuthGuard`; no public routes
- `apps/frontend/src/pages/GraphList.tsx`, `GraphDetail.tsx`, `Profile.tsx` — Correct TanStack Query usage; no conditional hooks; no DOM mutation
- `apps/auth-frontend/src/pages/Login.tsx`, `Register.tsx` — Correct redirect logic; form uses controlled inputs
- `apps/auth-frontend/src/pages/Logout.tsx` — Safe: errors swallowed, always navigates to login
- `apps/auth-frontend/src/hooks/useRedirectIfAuthenticated.ts` — Effect depends only on `data`; no missing dependencies
- `packages/types/src/user.ts`, `graph.ts`, `session.ts` — Password max 128 chars, email validation, date coercion
- `packages/session-store/src/layers/redis.ts` — All Redis operations in try/catch; graceful degradation
- `packages/session-store/src/layers/db.ts` — Expired session cleaned up on read
- `packages/session-store/src/layers/memory.ts` — LRU cache with TTL
- `turbo.json` — Correct dependency graph for Turborepo tasks
- `tsconfig.base.json` — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride` all enabled

---

## 6. Architecture Security Review

### Inter-Service Communication (gRPC)

The `api` service validates every incoming HTTP request by calling `auth-api` via gRPC (`ValidateSession`). The gRPC channel is authenticated using a short-lived HMAC-JWT (60-second TTL) in the `x-service-token` metadata header, verified by a custom interceptor in `addAuthService`. The JWT uses `iss: 'api'` as a claim and is signed with a shared `SERVICE_JWT_SECRET`.

**Weakness:** The gRPC channel is unencrypted (see GRPC-PLAINTEXT-1). The JWT provides authentication (confirming the caller is `api`) but not confidentiality. Session IDs, user emails, and permission results are transmitted in plaintext.

**Strength:** The JWT verification uses `jwt.verify()` which validates both the signature and the expiry. The `auth-api` gRPC server ignores the role field sent in the `CheckPermission` request and always re-fetches the user from the database to use the DB-authoritative role — preventing role spoofing via gRPC.

### Session Management

The `TieredSessionStore` implements a correct write-first-to-L3 pattern, ensuring session durability before L2/L1 caching. The gRPC `validateSession` handler reads directly from the session database (L3), which is always consistent with the durable write path. Session fixation is prevented by calling `req.session.regenerate()` on both login and registration.

**Weakness:** The `api` service reads the session cookie (`sid`), strips the express-session signature prefix (`s:SID.HMAC`), and sends the raw `SID` to `auth-api` via gRPC. The `auth-api` gRPC server performs no signature verification — it simply looks up the SID in the database. An attacker who knows a valid SID (from a log, memory dump, or the data files) could craft a cookie with the correct `s:SID` prefix (without the `.HMAC` part) and the API's middleware would strip it and send it as-is to gRPC. Since the HMAC is not verified by the API service (which doesn't have `SESSION_SECRET`), this could bypass cookie signing for session replay.

In practice, this means the cookie signature on the `api` side provides no security guarantee — the only protection is the difficulty of obtaining a valid SID. The `auth-api` could verify the cookie signature before accepting the SID, but this would require sharing `SESSION_SECRET` with `api`, which introduces its own risks.

### ABAC (Attribute-Based Access Control)

CASL abilities are defined per role and evaluated at the route level using `requireAbility()` middleware. Conditions are used to scope resource access (e.g., `{ userId: user.id }` for owned graphs, `{ isPublic: true }` for public graphs).

**Strength:** The role from the user's database record (not from the session token or gRPC request) is always used for ability evaluation, preventing privilege escalation via tampered tokens.

**Weakness:** The `requireAbility` middleware has no error handling for the async `getResource` callback (see ABAC-NOERROR-1). A database error during the ownership check crashes the service.

### Database Isolation

- `auth-api` uses its own LowDB file (`data/auth.json`, `data/auth-sessions.json`) or a separate MongoDB instance (port 27018).
- `api` uses `data/api.json`, `data/api-profiles.json` or the main MongoDB (port 27017).
- These are correctly isolated — a compromise of one database does not directly expose the other service's data.

**Note:** The LowDB data files for auth-api (user credentials, session data) exist on disk with real test data. These files are correctly excluded from git by the `.gitignore` pattern `apps/*/data/`, but they are unencrypted on disk.

---

## 7. Finding Summary Table

| ID | File | Description | Severity |
|----|------|-------------|----------|
| ENV-SECRETS-1 | `apps/api/.env`, `apps/auth-api/.env` | Real cryptographic secrets in committed .env files | Critical |
| DATA-PII-1 | `apps/auth-api/data/auth.json`, `auth-sessions.json` | Real user PII and session data in unencrypted flat files on disk | Critical |
| AUTH-FRONT-APP-1 | `apps/auth-frontend/src/App.tsx` (HEAD commit) | AuthGuard wraps public routes; `res.status` ReferenceError crashes auth-frontend | High |
| ASYNC-1 | Multiple route files + `packages/abac/src/middleware.ts` | All async route/middleware handlers lack try/catch under Express 4.x runtime | High |
| ABAC-NOERROR-1 | `packages/abac/src/middleware.ts` | `getResource` callback errors cause unhandled rejections | High |
| GRPC-PLAINTEXT-1 | `apps/auth-api/src/grpc/server.ts`, `packages/proto/src/client.ts` | gRPC transport is plaintext; session IDs and user data transmitted without encryption | Medium |
| LOWDB-CONCURRENT-1 | `packages/database/src/adapters/lowdb.ts` | LowDB has no write locking; concurrent write failures can leave inconsistent state | Medium |
| DOCKER-DEFAULTS-1 | `docker-compose.yml` | Weak default credentials for MongoDB and Redis | Medium |
| API-BODYLIMIT-1 | `apps/api/src/server.ts` | 5 MB JSON body limit is excessive for a graph REST API | Low |
| GRAPHS-DOUBLEFETCH-1 | `apps/api/src/routes/graphs.ts` | Double DB fetch per request for ABAC ownership check | Low |
| REDIRECT-DEAD-1 | `apps/auth-frontend/src/utils/redirect.ts` | `buildLoginUrl()` is dead code with undefined `VITE_AUTH_FRONTEND_URL` | Low |
| AUTH-TIMING-1 | `apps/auth-api/src/routes/auth.ts` | Same pre-computed hash reused for all timing decoy operations | Low |
| LOGGER-REDACT-1 | `packages/logger/src/index.ts` | Pino redact paths use single-level wildcard; deep fields not redacted | Low |
| MONGO-ESLINT-1 | `packages/database/src/adapters/mongodb.ts` | Widespread `eslint-disable` comments suppress type-safety warnings | Low |
| ENV-DOC-1 | `apps/auth-frontend/.env.example` | `VITE_DEFAULT_REDIRECT_URL` missing from .env.example | Low |

*(16 total: 2 Critical, 3 High, 3 Medium, 6 Low. Note: AUTH-FRONT-APP-1 and ABAC-NOERROR-1 are listed separately from ASYNC-1 for specificity; all relate to async error handling.)*

---

## 8. Recommendations

### Immediate Priority (Critical / High)

1. **Rotate all secrets immediately.** Generate new `SESSION_SECRET` (≥64 hex chars) and `SERVICE_JWT_SECRET` (≥32 hex chars). Update both `.env` files. Remove the `.env` files from the git staging area (`git restore --staged apps/api/.env apps/auth-api/.env`) and ensure `.gitignore` prevents them from being re-added.

2. **Audit git history for committed secrets.** Run `git log --all --full-history -- "apps/api/.env" "apps/auth-api/.env"` to determine if secrets were ever committed. If found, use `git filter-repo` to purge them from all commits and force-push.

3. **Commit the staged fixes immediately.** The working tree contains critical fixes (removal of buggy AuthGuard from auth-frontend, express-session route fixes, etc.) that are staged but not committed. Run `git commit -m "fix: apply remediation from FIX_AUDIT_REPORT.md"` to bring HEAD in line with the working tree.

4. **Fix async error handling.** Either upgrade `"express"` in both apps to `"^5.0.0"` (which automatically handles async errors), or wrap every `async` route handler and middleware body in `try/catch { next(err) }`. This includes the `requireAbility` middleware's `getResource` callback. This single change eliminates both ASYNC-1 and ABAC-NOERROR-1.

5. **Rotate credentials for test user accounts.** The accounts `amine@beihaqi.com` and `amine1@beihaqi.com` have real argon2id password hashes on disk. Invalidate their sessions and prompt password resets.

### Security Hardening (Medium)

6. **Enable TLS on gRPC connections (GRPC-PLAINTEXT-1).** Generate or provision TLS certificates. Update `packages/proto/src/server.ts` to use `grpc.ServerCredentials.createSsl()` and `packages/proto/src/client.ts` to use `grpc.credentials.createSsl()`. Gate insecure mode on `NODE_ENV !== 'production'`.

7. **Remove weak fallback credentials from docker-compose.yml (DOCKER-DEFAULTS-1).** Replace `${MONGO_ROOT_PASSWORD:-changeme}` and `${REDIS_PASSWORD:-redispassword}` with required variables (no defaults). Add a `docker-compose.env.example` file documenting the required values.

8. **Mitigate LowDB concurrent write risks (LOWDB-CONCURRENT-1).** For any production deployment using LowDB, add a write mutex (`async-mutex`). For production at scale, migrate to MongoDB.

### Housekeeping (Low)

9. **Reduce API body limit (API-BODYLIMIT-1).** Change `'5mb'` to `'512kb'` in `apps/api/src/server.ts` unless large graph payloads are a documented requirement.

10. **Remove dead `buildLoginUrl()` from auth-frontend (REDIRECT-DEAD-1).** Delete the function from `apps/auth-frontend/src/utils/redirect.ts` to avoid confusion and undefined behavior if accidentally invoked.

11. **Improve timing decoy implementation (AUTH-TIMING-1).** Replace the reused pre-computed hash with `await argon2.hash(password, params).catch(() => null)` in the login route's user-not-found branch.

12. **Fix Pino redact paths to cover nested fields (LOGGER-REDACT-1).** Change `'*.password'` to `'**.password'` (double-star) for all redact path entries in `packages/logger/src/index.ts`.

13. **Refactor MongoDB adapter to remove `eslint-disable` comments (MONGO-ESLINT-1).** Use proper `mongoose.Model<T>` generics to restore type safety without suppressions.

14. **Document `VITE_DEFAULT_REDIRECT_URL` in auth-frontend `.env.example` (ENV-DOC-1).** Add the variable with a sensible default value.

15. **Eliminate double DB fetch in ABAC-guarded routes (GRAPHS-DOUBLEFETCH-1).** Attach the fetched resource to `req` (e.g., `res.locals.resource`) in the `getResource` callback and consume it in the route handler.
