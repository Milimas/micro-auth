# Fusion-D Auth System — Developer Documentation

Fusion-D ships a production-grade, session-based authentication and authorization system across two backend microservices (`auth-api`, `api`), two React frontends (`auth-frontend`, `frontend`), and five shared packages. This documentation covers every auth and authorization concern end-to-end: HTTP sessions and tiered caching, gRPC inter-service token validation, and CASL-based attribute-level access control.

---

## Table of Contents

| Section | File | What it covers |
|---|---|---|
| Architecture Overview | [architecture/overview.md](architecture/overview.md) | Service map, auth data flow, technology table |
| Authentication Flows | [authentication/flows.md](authentication/flows.md) | Register, login, logout, refresh, endpoint reference, security middleware |
| Authorization / ABAC | [authorization/abac.md](authorization/abac.md) | CASL ability model, role definitions, middleware enforcement chain |
| Session Store | [sessions/session-store.md](sessions/session-store.md) | Tiered L1→L2→L3 store, express-session config, TTL strategy, layer design |
| gRPC Contract | [grpc/contract.md](grpc/contract.md) | Proto definition, client/server wiring, service token, when to use gRPC vs HTTP |
| Frontend Auth | [frontend-auth/flows.md](frontend-auth/flows.md) | Login/register UI flows, two AuthGuard variants contrasted, open-redirect defense |
| Monorepo Setup | [monorepo/setup.md](monorepo/setup.md) | pnpm workspaces, Turborepo pipeline, tsup, Vite — as they affect auth packages |
| Integration Guide | [integration/guide.md](integration/guide.md) | How to reuse auth-api, abac, session-store, and gRPC in another project |
| References | [references/index.md](references/index.md) | File-to-topic map, env vars, package dependency graph, library versions |

---

## Quick-Start Reading Paths

### "I want to understand the system"

1. [architecture/overview.md](architecture/overview.md) — service map and full auth data flow
2. [authentication/flows.md](authentication/flows.md) — how sessions are established
3. [sessions/session-store.md](sessions/session-store.md) — how sessions are stored across three layers
4. [grpc/contract.md](grpc/contract.md) — how `api` validates sessions against `auth-api`
5. [authorization/abac.md](authorization/abac.md) — how permissions are enforced per-request
6. [frontend-auth/flows.md](frontend-auth/flows.md) — what the browser experiences

### "I want to integrate the auth system into another project"

1. [integration/guide.md](integration/guide.md) — start here; every reusable piece has a minimal working example
2. [references/index.md](references/index.md) — env vars and library versions at a glance
3. [grpc/contract.md](grpc/contract.md) — the proto contract if you are writing a new gRPC consumer
4. [sessions/session-store.md](sessions/session-store.md) — if you need to swap the session backend

### "I want to re-implement the system from scratch"

1. [architecture/overview.md](architecture/overview.md) — understand all moving parts before writing code
2. [authentication/flows.md](authentication/flows.md) — implement the `auth-api` HTTP routes
3. [sessions/session-store.md](sessions/session-store.md) — implement the session store
4. [grpc/contract.md](grpc/contract.md) — implement the gRPC contract
5. [authorization/abac.md](authorization/abac.md) — implement the CASL ability model
6. [frontend-auth/flows.md](frontend-auth/flows.md) — implement the frontends
7. [monorepo/setup.md](monorepo/setup.md) — wire everything together in a monorepo
