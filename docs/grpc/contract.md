# gRPC Contract

## Proto Definition

The entire service contract lives in `packages/proto/proto/auth.proto`. It is reproduced in full below — this file is the source of truth for both the client (`api`) and the server (`auth-api`).

```protobuf
syntax = "proto3";

package auth;

option java_package = "com.fusiond.auth";
option java_outer_classname = "AuthProto";

service AuthService {
  // Validates a session ID and returns the associated user info
  rpc ValidateSession(ValidateSessionRequest) returns (ValidateSessionResponse);

  // Checks whether a user has permission to perform an action on a subject
  rpc CheckPermission(CheckPermissionRequest) returns (CheckPermissionResponse);
}

message ValidateSessionRequest {
  string session_id = 1;
}

message ValidateSessionResponse {
  bool valid = 1;
  string user_id = 2;
  string role = 3;
  string email = 4;
}

message CheckPermissionRequest {
  string user_id = 1;
  string role = 2;
  string action = 3;
  string subject = 4;
  map<string, string> resource_attributes = 5;
}

message CheckPermissionResponse {
  bool allowed = 1;
}
```

---

## Message Types

```mermaid
classDiagram
    class ValidateSessionRequest {
        +string sessionId
    }

    class ValidateSessionResponse {
        +bool valid
        +string userId
        +string role
        +string email
    }

    class CheckPermissionRequest {
        +string userId
        +string role
        +string action
        +string subject
        +map~string·string~ resourceAttributes
    }

    class CheckPermissionResponse {
        +bool allowed
    }

    class AuthService {
        +ValidateSession(ValidateSessionRequest) ValidateSessionResponse
        +CheckPermission(CheckPermissionRequest) CheckPermissionResponse
    }

    AuthService --> ValidateSessionRequest
    AuthService --> ValidateSessionResponse
    AuthService --> CheckPermissionRequest
    AuthService --> CheckPermissionResponse
```

The TypeScript interfaces that match the proto messages are hand-maintained in `packages/proto/src/types.ts`. Field names are camelCased (proto-loader converts `snake_case` at runtime with `keepCase: false`).

---

## Server and Client Wiring

```mermaid
graph TD
    subgraph "auth-api process"
        GS[grpc.Server]
        AS[addAuthService<br/>packages/proto/src/server.ts]
        IMPL[AuthServiceImplementation<br/>apps/auth-api/src/grpc/server.ts]
        INT[verifyServiceToken interceptor]
        GS --> AS
        AS --> INT
        INT -->|valid token| IMPL
        INT -->|invalid token| UNAUTH[UNAUTHENTICATED error]
    end

    subgraph "api process"
        GC[createAuthClient<br/>packages/proto/src/client.ts]
        MW[auth middleware<br/>apps/api/src/middleware/auth.ts]
        CL[getAuthClient singleton<br/>apps/api/src/grpc/client.ts]
        MW --> CL
        CL --> GC
    end

    GC -->|"InsecureCredentials<br/>x-service-token: JWT"| GS
```

**Server side** (`auth-api`): `addAuthService(server, implementation, serviceToken, tokenVerifier)` wraps each RPC handler in a token-check interceptor before registering the service. The interceptor calls `verifyServiceToken` which reads the `x-service-token` metadata header and passes it to `tokenVerifier`. In production, `tokenVerifier` calls `jwt.verify(token, SERVICE_JWT_SECRET)`.

**Client side** (`api`): `createAuthClient(address, getToken)` creates a raw gRPC client and wraps `validateSession` and `checkPermission` in a `callWithToken` helper. Before each call, `getToken()` is invoked to produce a fresh JWT signed with `SERVICE_JWT_SECRET` (`iss: 'api'`, `expiresIn: 60`). The JWT is attached as `x-service-token` in gRPC `Metadata`.

The client instance is a module-level singleton (`apps/api/src/grpc/client.ts:5`). It is created once on first use and reused for the lifetime of the `api` process.

> **Security:** The gRPC channel uses `grpc.credentials.createInsecure()` — there is no TLS on the gRPC transport in the current configuration. This is acceptable when `auth-api` and `api` run on the same private network or within the same container network, but it must be changed to `grpc.credentials.createSsl()` for any deployment where the two services communicate over an untrusted network.

---

## Complete Auth Verification Call

This sequence shows the full `ValidateSession` call from `api`'s auth middleware through to the response.

```mermaid
sequenceDiagram
    participant MW as auth middleware (api)
    participant CL as AuthServiceClient (singleton)
    participant META as grpc.Metadata
    participant GS as addAuthService interceptor
    participant IMPL as validateSession handler
    participant SS as sessionDb (auth-api)
    participant UDB as userDb (auth-api)

    MW->>MW: extract raw SID from cookie<br/>strip "s:" and ".HMAC"
    MW->>CL: validateSession({ sessionId: rawSID })
    CL->>CL: getToken() → jwt.sign({ iss:"api" }, SECRET, { expiresIn:60 })
    CL->>META: metadata.set("x-service-token", jwt)
    CL->>GS: gRPC unary call + metadata

    GS->>GS: verifyServiceToken<br/>jwt.verify(token, SERVICE_JWT_SECRET)
    alt JWT invalid or missing
        GS-->>CL: status.UNAUTHENTICATED
        CL-->>MW: throws
        MW-->>Browser: 503 Authentication service unavailable
    end

    GS->>IMPL: call.request = { sessionId }

    IMPL->>SS: sessionDb.findOne({ sid: sessionId })
    alt not found
        IMPL-->>CL: { valid: false }
        CL-->>MW: { valid: false }
        MW-->>Browser: 401 Session expired or invalid
    end

    IMPL->>IMPL: check session.expiresAt < now
    alt expired
        IMPL-->>CL: { valid: false }
        MW-->>Browser: 401
    end

    IMPL->>UDB: userDb.findById(session.userId)
    alt not found or inactive
        IMPL-->>CL: { valid: false }
        MW-->>Browser: 401
    end

    IMPL-->>CL: { valid:true, userId, role, email }
    CL-->>MW: ValidateSessionResponse
    MW->>MW: req.user = { id:userId, email, role }
    MW->>MW: next()
```

---

## gRPC vs HTTP Session — When Each Is Used

| Concern | Transport | Who calls | Who serves |
|---|---|---|---|
| Browser authentication (login, register, logout, me, refresh) | HTTP | `auth-frontend` or `frontend` browser | `auth-api` HTTP `:4001` |
| Session validation on every `api` request | gRPC `ValidateSession` | `api` middleware | `auth-api` gRPC `:50051` |
| Permission check for resource-level authorization | gRPC `CheckPermission` | `api` route (when needed) | `auth-api` gRPC `:50051` |

The rule is simple: **browsers talk HTTP; services talk gRPC**. The HTTP endpoints exist so that browser clients can authenticate and manage their session cookie. The gRPC endpoints exist so that `api` can verify that cookie and check permissions without needing direct access to the session database.

`CheckPermission` via gRPC is available but it is also possible — and often preferable for latency — to call `defineAbilityFor(req.user)` directly in `api` using the `@fusion-d/abac` package, since `req.user` already carries `role`. The gRPC path is used when the permission check requires a database-authoritative role (not the cached one in the session).

---

## Proto Build Process

The proto file is loaded at runtime using `@grpc/proto-loader` (dynamic loading, no code generation step required for runtime). The loader is initialized lazily and cached as a module singleton in `packages/proto/src/loader.ts`.

A `proto:generate` script exists in `packages/proto/package.json` that uses `grpc-tools` + `ts-proto` to generate static TypeScript types, but those generated files are **not** committed or used at runtime — the hand-maintained types in `packages/proto/src/types.ts` are used instead.

During the `proto` package build, the `proto/` directory is copied into `dist/proto/` so that the compiled package can resolve the `.proto` file at runtime via the relative path in `loader.ts`.
