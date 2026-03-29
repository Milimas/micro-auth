# Architecture Overview

## Service Map

The following diagram shows every Fusion-D service, shared package, and storage backend that participates in authentication or authorization, and the connections between them.

```mermaid
graph TD
    subgraph Browsers
        AF["auth-frontend · :5174<br/>Vite + React 18"]
        FE["frontend · :5173<br/>Vite + React 18"]
    end

    subgraph "Backend Services"
        AA["auth-api · :4001 HTTP · :50051 gRPC<br/>Express 5 — owns users + sessions"]
        API["api · :4000 HTTP<br/>Express 5 — owns graphs + profiles"]
    end

    subgraph "Shared Packages"
        TYPES["@fusion-d/types<br/>Zod schemas · TUser · TSession"]
        SESSION["@fusion-d/session-store<br/>TieredSessionStore"]
        ABAC["@fusion-d/abac<br/>CASL abilities · requireAbility"]
        PROTO["@fusion-d/proto<br/>gRPC client + server helpers"]
        DB["@fusion-d/database<br/>IDatabase&lt;T&gt; interface"]
        LOGGER["@fusion-d/logger<br/>Pino factory"]
    end

    subgraph Storage
        MONGO_A["MongoDB · :27018<br/>auth: users · sessions"]
        MONGO_API["MongoDB · :27017<br/>api: graphs · profiles"]
        REDIS["Redis · :6379<br/>session L2 cache"]
    end

    AF -->|"HTTP /auth/*<br/>credentials:include"| AA
    FE -->|"HTTP GET /auth/me<br/>credentials:include"| AA
    FE -->|"HTTP /graphs · /profile"| API
    API -->|"gRPC ValidateSession<br/>CheckPermission<br/>x-service-token JWT"| AA

    AA --> SESSION
    AA --> ABAC
    AA --> PROTO
    AA --> DB
    AA --> TYPES
    AA --> LOGGER

    API --> PROTO
    API --> ABAC
    API --> TYPES
    API --> LOGGER
    API --> DB

    SESSION --> REDIS
    SESSION --> DB
    DB -->|"users · sessions collections"| MONGO_A
    API -->|"graphs · profiles collections"| MONGO_API
```

Key observations:
- `auth-api` is the **only** service that reads or writes user records and session records. `api` never queries those databases directly.
- `api` delegates **all** identity verification to `auth-api` via gRPC on every request. There is no local token cache in `api`.
- `frontend` calls `/auth/me` on `auth-api` (not on `api`) to establish user identity for the UI.
- The session store is a package owned entirely by `auth-api`; `api` never touches it.

---

## Auth-Specific Data Flow

The sequence below shows what happens when a browser with a valid session cookie makes a request to a protected `api` route. This is the most complete path through the auth system.

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as api :4000
    participant AM as auth middleware (api)
    participant GC as gRPC client
    participant GS as gRPC server (auth-api :50051)
    participant SS as TieredSessionStore
    participant UDB as userDb (auth-api)

    B->>API: GET /graphs  Cookie: sid=s:SID.HMAC
    API->>AM: createAuthMiddleware(authClient)
    AM->>AM: strip "s:" prefix and ".HMAC" suffix → raw SID
    AM->>GC: validateSession({ sessionId: rawSID })
    GC->>GC: sign short-lived JWT (iss:"api", exp:60s)
    GC->>GS: gRPC ValidateSession  x-service-token: <JWT>
    GS->>GS: verifyServiceToken — jwt.verify(token, SERVICE_JWT_SECRET)
    alt token invalid
        GS-->>GC: UNAUTHENTICATED
        GC-->>AM: error
        AM-->>B: 503 Authentication service unavailable
    end
    GS->>SS: sessionDb.findOne({ sid: rawSID })
    SS->>SS: L1 memory check
    alt L1 hit
        SS-->>GS: SessionData
    else L1 miss → L2
        SS->>SS: Redis GET sess:rawSID
        alt L2 hit
            SS->>SS: warm L1
            SS-->>GS: SessionData
        else L2 miss → L3
            SS->>SS: db.findOne({ sid })
            SS->>SS: check expiresAt
            alt expired
                SS-->>GS: null
            else valid
                SS->>SS: warm L2 (fire-and-forget) + warm L1
                SS-->>GS: SessionData
            end
        end
    end
    alt session not found or expired
        GS-->>GC: { valid: false }
        GC-->>AM: { valid: false }
        AM-->>B: 401 Session expired or invalid
    end
    GS->>UDB: findById(session.userId)
    alt user not found or inactive
        GS-->>GC: { valid: false }
        AM-->>B: 401
    end
    GS-->>GC: { valid:true, userId, role, email }
    GC-->>AM: ValidateSessionResponse
    AM->>API: req.user = { id, email, role }  next()
    API->>API: requireAbility / route handler
    API-->>B: 200 response
```

---

## Technology Table

| Package / Library | Role in the auth system | Source |
|---|---|---|
| **Express 5** | HTTP server for `auth-api` and `api` | `apps/auth-api/`, `apps/api/` |
| **express-session** | Session middleware — manages cookie lifecycle and delegates storage to `TieredSessionStore` | `apps/auth-api/src/server.ts` |
| **argon2** | Password hashing (argon2id, memoryCost 64 MB, timeCost 3, parallelism 4) | `apps/auth-api/src/routes/auth.ts` |
| **helmet** | HTTP security headers (CSP, X-Frame-Options, etc.) | `apps/auth-api/src/middleware/security.ts` |
| **cors** | Explicit-origin allowlist; `credentials:true` for cookie forwarding | `apps/auth-api/src/middleware/security.ts` |
| **express-rate-limit** | Per-IP rate limiting on login (10/15 min), register (5/hr), and general routes (100/min) | `apps/auth-api/src/middleware/security.ts` |
| **@grpc/grpc-js + @grpc/proto-loader** | gRPC transport — `auth-api` serves, `api` calls | `packages/proto/` |
| **jsonwebtoken** | Signs and verifies the `x-service-token` JWT for service-to-service gRPC calls | `apps/api/src/grpc/client.ts`, `apps/auth-api/src/grpc/server.ts` |
| **@casl/ability** | Attribute-based access control — ability definitions keyed by user role | `packages/abac/` |
| **lru-cache** | In-process L1 session cache (≤60 s TTL, 1 000-item LRU) | `packages/session-store/src/layers/memory.ts` |
| **ioredis** | L2 session cache (Redis, 24 h TTL, graceful degradation) | `packages/session-store/src/layers/redis.ts` |
| **mongoose** | MongoDB ODM for user and session persistence in production | `apps/auth-api/src/server.ts` |
| **zod** | Runtime schema validation for env config, request bodies, and domain types | `packages/types/`, `apps/auth-api/src/config.ts` |
| **@tanstack/react-query** | Client-side data fetching; drives AuthGuard session check | `apps/auth-frontend/`, `apps/frontend/` |
| **react-router-dom v6** | Client-side routing for auth-frontend pages | `apps/auth-frontend/src/App.tsx` |
| **pino** | Structured JSON logging; redacts `password`, `token`, `secret`, `cookie` | `packages/logger/` |
| **Vite** | Dev server and bundler for both React frontends | `apps/auth-frontend/`, `apps/frontend/` |
| **tsup** | Bundles shared packages to ESM with `.d.ts` declarations | All `packages/*/tsup.config.ts` |
| **Turborepo** | Orchestrates build/dev/test tasks across the monorepo in dependency order | `turbo.json` |
| **pnpm workspaces** | Links internal packages via `workspace:*` protocol | `pnpm-workspace.yaml` |
