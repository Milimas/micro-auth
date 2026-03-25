# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Fusion-D is a production-grade SaaS monorepo for a graph management platform. It uses Turborepo + pnpm workspaces with separate auth and API microservices, tiered session caching, CASL-based ABAC, and gRPC inter-service communication.

## Commands

```bash
# Install all dependencies (run first)
pnpm install

# Start all services in development (requires docker services running)
pnpm dev

# Start infrastructure (MongoDB x2 + Redis)
docker compose up -d

# Build all packages + apps in dependency order
pnpm build

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run all tests
pnpm test

# Run a single package's dev/test/build
pnpm --filter @fusion-d/auth-api dev
pnpm --filter @fusion-d/database test
pnpm --filter @fusion-d/types build
```

## Ports

| Service | Port |
|---|---|
| api | 4000 (HTTP) |
| auth-api | 4001 (HTTP), 50051 (gRPC) |
| frontend | 5173 |
| auth-frontend | 5174 |
| MongoDB (api) | 27017 |
| MongoDB (auth) | 27018 |
| Redis | 6379 |

## Architecture

### Packages (shared, built with tsup)

- **`@fusion-d/types`** — Zod schemas + inferred TypeScript types for `TUser`, `TGraph`, `TSession`, `TUserProfile`. All validation happens here.
- **`@fusion-d/logger`** — Pino factory (`createLogger(service)`). JSON in prod, pretty-print in dev. Redacts `password`, `token`, `secret`, `cookie` fields.
- **`@fusion-d/database`** — `IDatabase<T>` interface with two interchangeable adapters: `MongoDBAdapter<T>` (Mongoose) and `LowDBAdapter<T>` (lowdb v7). Switch via `DB_TYPE` env var — no code changes needed.
- **`@fusion-d/session-store`** — `TieredSessionStore` extends `express-session`'s `Store`. Three layers: `MemoryLayer` (lru-cache, L1 ~60s TTL) → `RedisLayer` (ioredis, L2 24h) → `DbLayer` (L3, persistent). Read path: hit on L1 returns immediately; misses warm higher layers on the way back. Write path: L3 first (durable), then L2 + L1 fire-and-forget. Redis unavailability degrades gracefully.
- **`@fusion-d/proto`** — Proto definitions (`proto/auth.proto`) + gRPC transport helpers. `createAuthClient(address, token)` for callers; `addAuthService(server, impl, token)` for the server. Service-to-service calls carry an HMAC-JWT in the `x-service-token` gRPC metadata header.
- **`@fusion-d/abac`** — CASL ability definitions. `defineAbilityFor(user)` returns a `MongoAbility` instance keyed to the user's role (`admin`/`editor`/`viewer`). `requireAbility(action, subject, getResource?)` is an Express middleware factory for route-level guards.

### Apps

- **`auth-api`** (Express + gRPC server) — Owns user and session data in a **separate** database from `api`. Handles `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/refresh`. Sessions use `TieredSessionStore`. Passwords hashed with argon2id. Exposes gRPC `ValidateSession` and `CheckPermission` for service-to-service calls.
- **`api`** (Express) — Handles `/graphs` CRUD and `/profile`. Every request calls auth-api via gRPC to validate the session cookie. Uses `requireAbility` middleware for ownership checks. Secrets in Graph responses are always masked (`****`).
- **`frontend`** (Vite + React 18) — `AuthGuard` component calls `/auth/me`; on 401 the `api.ts` fetch wrapper redirects to `auth-frontend/login?redirect=<current-url>`. Uses TanStack Query for data fetching.
- **`auth-frontend`** (Vite + React 18) — Login, Register, Logout pages. On success, redirects to the `?redirect` param after validating it against `VITE_ALLOWED_REDIRECT_ORIGINS` (open redirect prevention).

### Communication

- **HTTP**: `frontend` ↔ `api`, `auth-frontend` ↔ `auth-api`
- **gRPC**: `api` → `auth-api` (session validation + permission checks)

### Database isolation

- `auth-api` uses its own MongoDB instance (port 27018) or separate LowDB file
- `api` uses the main MongoDB instance (port 27017) or a separate LowDB file
- Both DBs are hardcoded in `docker-compose.yml`

## Key Design Decisions

### Security

- `passwordHash` (not `password`) is the field name in `TUser` — argon2id with `memoryCost: 65536`
- Session ID is regenerated on login (prevents session fixation)
- `TGraph.secrets` values are **never** returned to clients — masked as `****` in all responses
- CORS uses an explicit origin allowlist (no wildcard)
- `?redirect` on auth-frontend is validated against `VITE_ALLOWED_REDIRECT_ORIGINS` before following
- gRPC calls carry a shared `SERVICE_JWT_SECRET` token validated via server interceptor

### Environment variables

Each app has a `.env.example`. Required secrets must be generated before starting:
```bash
openssl rand -hex 64   # SESSION_SECRET (auth-api)
openssl rand -hex 32   # SERVICE_JWT_SECRET (both api and auth-api — must match)
```

### Adding a new database collection

1. Define the type + Zod schema in `packages/types/src/`
2. Create a `IDatabase<YourType>` instance in the relevant app's `server.ts` using `createDatabase` pattern
3. No adapter changes needed — both `MongoDBAdapter` and `LowDBAdapter` are generic

### Regenerating proto types

```bash
# Requires protoc + grpc-tools installed globally
pnpm --filter @fusion-d/proto proto:generate
```
