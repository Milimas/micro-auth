# Fusion-D — Fix Audit Report

**Project:** Fusion-D (micro-auth monorepo)
**Auditor:** Claude Code
**Date:** 2026-03-26
**Source report:** AUDIT_REPORT.md
**Severity filter:** all

---

## 1. Executive Summary

16 of 19 findings were fixed directly. 2 Low-severity findings (GRAPHS-1, MONGO-1) were skipped because they require structural refactoring beyond a safe in-place edit. 1 Medium finding (GRPC-2) requires TLS certificate infrastructure and cannot be completed with code edits alone.

⚠️ **Git history action required:** The committed PII in `apps/auth-api/data/auth.json` and `auth-sessions.json` has been sanitized in the working tree, but the data still exists in prior commits. See §4 Warnings.

⚠️ **Rebuild required:** GRPC-3 changes the `createAuthClient` and `addAuthService` signatures in `@fusion-d/proto`. Run `pnpm --filter @fusion-d/proto build` before starting any service.

| Status           | Count |
|------------------|-------|
| Fixed            | 16    |
| Already Fixed    | 1     |
| Manual Required  | 3     |
| Skipped (filter) | 0     |

---

## 2. Fixes Applied

| ID | Severity | File | Line | Change Summary |
|----|----------|------|------|----------------|
| AUTH-FRONT-1 | Critical | `apps/auth-frontend/src/components/AuthGuard.tsx` | 24 | Replaced undefined `res.status === 200` with `if (data)` check using TanStack Query data; fixed type cast to `string \| undefined` |
| AUTH-API-1 | Critical | `apps/auth-api/data/auth.json`, `auth-sessions.json` | — | Emptied both data files (`{"items":[]}`); added `apps/*/data/` to `.gitignore` |
| GRPC-1 | High | `apps/auth-api/src/grpc/server.ts` | 20, 44 | Wrapped both `validateSession` and `checkPermission` handler bodies in `try/catch`; calls `callback({ code: grpc.status.INTERNAL })` on error |
| DOCKER-1 | High | `docker-compose.yml` | 4–34 | Added `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` env vars to both MongoDB services; updated healthcheck commands to authenticate |
| API-AUTH-1 | High | `apps/api/src/middleware/auth.ts` | 29 | Replaced `.split('.')[0]` with `.replace(/\.[^.]*$/, '')` (last-dot split) to correctly handle session IDs containing dots |
| GRAPHS-2 | High | `apps/api/src/routes/graphs.ts` | 29 | Added `getResource` callback `async (req) => ({ userId: req.user!.id })` to `requireAbility('read', 'Graph')` so the CASL conditional check can be evaluated for viewer role |
| AUTH-FRONT-2 | Medium | `apps/auth-frontend/src/App.tsx` | 10 | Removed `AuthGuard` wrapper from all routes; public auth pages (`/login`, `/register`, `/logout`) now render unconditionally for unauthenticated users |
| GRPC-3 | Medium | `packages/proto/src/server.ts`, `packages/proto/src/client.ts`, `apps/auth-api/src/grpc/server.ts`, `apps/api/src/grpc/client.ts` | — | Extended `addAuthService` with optional `tokenVerifier` callback; extended `createAuthClient` to accept `getToken: () => string`; wired JWT signing (`jsonwebtoken`, 60s expiry) in api client and JWT verification in auth-api gRPC server |
| ABAC-1 | Medium | `packages/abac/src/ability.ts` | 28–29 | Expanded array action calls into individual `can()` calls; updated `CanFn` type to accept only `AppAction` (not `AppAction[]`), removing the array cast; retained `_can as unknown as CanFn` for the conditions typing limitation |
| PROFILE-1 | Medium | `apps/api/src/routes/profile.ts` | 47 | Added `getResource` callback `async (req) => ({ userId: req.user!.id })` to `requireAbility('update', 'UserProfile')` so CASL conditional check passes for editor role |
| ENV-1 | Medium | `.gitignore` | — | Added `apps/*/data/` pattern; prevents all LowDB data files from being tracked |
| AUTH-ROUTES-1 | Medium | `apps/auth-api/src/routes/auth.ts`, `apps/auth-api/src/server.ts` | 131 | Added `cookieName` parameter (default `'sid'`) to `createAuthRouter`; `clearCookie` now uses the configured name; call site in `server.ts` passes `config.SESSION_COOKIE_NAME` |
| AUTH-ROUTES-2 | Low | `apps/auth-api/src/routes/auth.ts` | 88–93 | Replaced `argon2.hash('dummy-constant-time-work')` with `argon2.verify(await _dummyHashPromise, password)` against a module-level pre-computed hash; better matches the timing of the real verify path |
| SERVER-1 | Low | `apps/auth-api/src/server.ts`, `apps/api/src/server.ts` | 28–31 | Replaced empty `strict: false` Mongoose schemas with explicit field definitions for users, sessions, graphs, and profiles |
| SESSION-1 | Low | `packages/session-store/src/layers/db.ts` | 32 | Changed `userId ?? 'unknown'` to `userId ?? ''`; empty string is less misleading as a sentinel for pre-login sessions |
| ENV-2 | Low | `apps/api/.env` | 15 | Already fixed (file contains only `http://localhost:5173`) |

---

## 3. Skipped / Manual Action Required

| ID | Severity | Reason |
|----|----------|--------|
| GRPC-2 | Medium | gRPC plaintext transport — requires TLS certificates and environment-gated credential setup. Cannot be fully implemented as a code edit without cert infrastructure. When ready: use `grpc.credentials.createSsl()` on client and `grpc.ServerCredentials.createSsl()` on server, gated on `NODE_ENV === 'production'`. |
| GRAPHS-1 | Low | Double DB fetch per request — requires attaching the fetched resource to `req` inside `requireAbility`'s `getResource` callback and reading it in the route handler. Needs a change to the `requireAbility` middleware signature or an extension to the Express `Request` type. Skipped to avoid over-engineering a Low finding. |
| MONGO-1 | Low | Widespread `eslint-disable` comments in `packages/database/src/adapters/mongodb.ts` — removing them requires refactoring the adapter to use a proper `Model<T>` generic, which touches the interface definition and both adapters. Too large a change for a code-quality Low finding. |

---

## 4. Warnings

### ⚠️ Git History Contains Committed PII — Immediate Action Required

The data files `apps/auth-api/data/auth.json` and `apps/auth-api/data/auth-sessions.json` have been sanitized in the working tree, but the original files (containing real email addresses, argon2id password hashes, and a live session token) remain in commits `43e7f6b` and `cc82b45`.

**Steps to remove from history:**

```bash
# 1. Install git-filter-repo if not present
pip install git-filter-repo

# 2. Remove the sensitive files from all commits
git filter-repo --path apps/auth-api/data/auth.json --invert-paths
git filter-repo --path apps/auth-api/data/auth-sessions.json --invert-paths

# 3. Force-push all branches (coordinate with all collaborators first)
git push --force-with-lease origin main

# 4. All clones must re-clone — the rewritten history is incompatible with stale clones
```

**Additionally:**
- Rotate the passwords of affected accounts: `amine@beihaqi.com`, `amine1@beihaqi.com`
- Invalidate all existing sessions for those accounts
- The committed session ID (`9QB9Xe_r-...`) has already expired, but invalidate it server-side regardless

### ⚠️ MongoDB Credentials — Update Connection URIs

`docker-compose.yml` now requires `MONGO_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD` (defaults: `admin` / `changeme`). When switching either service to `DB_TYPE=mongo`, update the `MONGO_URI` env var to include credentials:

```
MONGO_URI=mongodb://admin:changeme@localhost:27017/fusion_api
MONGO_URI=mongodb://admin:changeme@localhost:27018/fusion_auth
```

Change the default credentials in production.

### ⚠️ Proto Package Must Be Rebuilt

GRPC-3 changed the public API of `@fusion-d/proto`:
- `createAuthClient(address, serviceToken: string)` → `createAuthClient(address, getToken: () => string)`
- `addAuthService(server, impl, token)` → `addAuthService(server, impl, token, verifier?)`

Run before starting any service:
```bash
pnpm --filter @fusion-d/proto build
```
