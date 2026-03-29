# Session Store

## express-session Configuration

`auth-api` mounts `express-session` in `apps/auth-api/src/server.ts` with a custom store:

```typescript
session({
  name: config.SESSION_COOKIE_NAME,      // default: 'sid'
  secret: config.SESSION_SECRET,          // min 64 chars, used to sign cookie HMAC
  store,                                  // TieredSessionStore
  resave: false,                          // do not re-save unchanged sessions
  saveUninitialized: false,               // do not create sessions for unauthenticated requests
  rolling: true,                          // reset maxAge on every response
  cookie: {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: config.SESSION_TTL_SECONDS * 1000,  // default: 86 400 000 ms (24 h)
  },
})
```

`saveUninitialized: false` is important for performance: anonymous requests (the login page itself, health checks) do not create session records. A session is only created and persisted after `session.regenerate()` is called in the login or register handler.

The cookie value written to the browser is `s:SID.HMAC` where `SID` is the raw session identifier and `HMAC` is an HMAC-SHA256 signature computed from `SESSION_SECRET`. The raw `SID` is what gets stored as the key in all three store layers.

---

## Session Type

```mermaid
classDiagram
    class TSession {
        +string id
        +string sid
        +string userId
        +Record~string·unknown~ data
        +string? ipAddress
        +string? userAgent
        +Date createdAt
        +Date updatedAt
        +Date expiresAt
    }

    class SessionData {
        +string? userId
        +string? role
        +string? email
    }

    TSession "stores" --> SessionData : data field contains
```

`TSession` is the database record (`packages/types/src/session.ts`). The `data` field holds the `express-session` `SessionData` object, which is augmented with `userId`, `role`, and `email` by the auth routes (`apps/auth-api/src/routes/auth.ts:10–16`).

---

## Tiered Store Architecture

```mermaid
graph TD
    ES[express-session] -->|get · set · destroy · touch| TS[TieredSessionStore]

    TS -->|L1| ML["MemoryLayer<br/>lru-cache<br/>TTL: min(SESSION_TTL, 60s)<br/>max: 1000 items"]
    TS -->|L2| RL["RedisLayer<br/>ioredis<br/>TTL: SESSION_TTL_SECONDS<br/>key: sess:SID"]
    TS -->|L3| DL["DbLayer<br/>IDatabase&lt;TSession&gt;<br/>TTL: SESSION_TTL_SECONDS<br/>persistent"]

    DL -->|findOne · create · update · delete| DB[(auth database)]
    RL -->|GET · SETEX · DEL · EXPIRE| Redis[(Redis)]
```

`TieredSessionStore` extends `express-session`'s `Store` class. The three layers are injected via constructor; only the `MemoryLayer` is synchronous — `RedisLayer` and `DbLayer` are async.

---

## Read Path

```mermaid
flowchart TD
    A([get SID]) --> L1{L1 hit?}
    L1 -->|yes| R1[return SessionData]
    L1 -->|no| L2{L2 hit?}
    L2 -->|yes| W1[warm L1]
    W1 --> R2[return SessionData]
    L2 -->|no| L3{L3 hit?}
    L3 -->|not found| RN[return null]
    L3 -->|found| EXP{expiresAt past?}
    EXP -->|yes| DEL[delete from L3]
    DEL --> RN
    EXP -->|no| W2[warm L2 fire-and-forget<br/>warm L1]
    W2 --> R3[return SessionData]
```

L1 is an in-process LRU cache — a hit has zero network overhead and completes in microseconds. L2 (Redis) is checked on an L1 miss; a hit warms L1 and returns. L3 (database) is the authoritative source; a hit warms both L2 and L1.

Expiry is enforced at L3: `DbLayer.get()` checks `expiresAt` and deletes stale records before returning `null`. Redis relies on native TTL (`SETEX`). L1 relies on lru-cache's per-item TTL.

---

## Write Path

```mermaid
flowchart TD
    A([set SID, SessionData]) --> D[await L3 db.set — durable write first]
    D --> E[L2 redis.set — fire-and-forget]
    E --> F[L1 memory.set — synchronous]
```

L3 is always written first and awaited. L2 and L1 are best-effort: if Redis is unavailable, the session is still durably stored in the database. The in-memory set is synchronous and never fails.

---

## Destroy Path

When `session.destroy()` is called (on logout):

1. `MemoryLayer.delete(sid)` — synchronous, immediate.
2. `Promise.allSettled([redis.delete(sid), db.delete(sid)])` — both run concurrently; errors are suppressed so a Redis failure does not prevent DB cleanup.

---

## Touch Path (TTL Extension)

`session.touch()` is called explicitly by `POST /auth/refresh`, and implicitly by `express-session` on every response when `rolling: true`:

1. `redis.touch(sid, ttl)` — fire-and-forget; calls Redis `EXPIRE`.
2. `await db.touch(sid, ttl)` — updates the `expiresAt` field in the database.

L1 TTL is not explicitly extended because L1 entries are short-lived (≤60 s) and will be re-warmed from L2/L3 on the next read.

---

## Redis Degradation

`RedisLayer` is configured with:

```typescript
new Redis(redisUrl, {
  lazyConnect: true,          // does not connect until .connect() is called
  enableOfflineQueue: false,  // commands fail immediately if disconnected
  maxRetriesPerRequest: 1,    // one retry per command before failing
})
```

All `RedisLayer` methods catch errors silently. If Redis is unavailable during startup, `auth-api` logs a warning and continues (`apps/auth-api/src/server.ts:61–63`). The session store degrades to L1 + L3 only: read latency increases on L1 misses, but sessions remain fully functional.

> **Security:** Redis stores session data as JSON under the key `sess:SID`. Access to Redis must be restricted at the network level; there is no application-level encryption of the session payload in Redis.

---

## Layer Summary

| Layer | Implementation | TTL | Survives restart | Survives Redis outage |
|---|---|---|---|---|
| L1 Memory | `lru-cache` | ≤60 s | No | Yes |
| L2 Redis | `ioredis` | `SESSION_TTL_SECONDS` (24 h) | Yes (Redis persistence) | No |
| L3 DB | `IDatabase<TSession>` | `SESSION_TTL_SECONDS` (24 h) | Yes | Yes |
