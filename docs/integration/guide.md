# Integration Guide

This guide explains how to reuse each auth component of Fusion-D in a different project. Each section is self-contained.

> Infrastructure note: all components that use sessions or databases require Redis and MongoDB (or LowDB for development). See `docker-compose.yml` in the repo root for a working local setup — the service names, ports, and credentials used there match the defaults in all `.env.example` files.

---

## 1. auth-api as a Standalone Service

`apps/auth-api` is a self-contained Express + gRPC service. To run it in another project:

**What to copy:**
- `apps/auth-api/` — the entire app
- `packages/types/`, `packages/session-store/`, `packages/abac/`, `packages/proto/`, `packages/database/`, `packages/logger/` — all shared packages

**Required environment variables:**

```bash
SESSION_SECRET=<openssl rand -hex 64>
SERVICE_JWT_SECRET=<openssl rand -hex 32>
SESSION_COOKIE_NAME=sid
SESSION_TTL_SECONDS=86400
DB_TYPE=lowdb                          # or mongo
LOWDB_PATH=./data/auth.json
# MONGO_URI=mongodb://localhost:27018/my_auth
REDIS_URL=redis://:password@localhost:6379
ALLOWED_CORS_ORIGINS=http://localhost:3000
PORT=4001
GRPC_PORT=50051
```

**Minimal startup:**

```typescript
import { config } from './config.js'
import { createServer } from './server.js'

const { app } = await createServer(config)
app.listen(config.PORT)
```

`createServer` handles database initialization, session store construction, gRPC server startup, and Express wiring. You get HTTP on `PORT` and gRPC on `GRPC_PORT` from one call.

**Adding new user fields:**

1. Extend `ZUser` in `packages/types/src/user.ts`
2. Add the field to the Mongoose schema in `apps/auth-api/src/server.ts`
3. Expose it via `ZPublicUser` if it should be returned to clients

---

## 2. @fusion-d/abac in a New Express App

The ABAC package has no auth-api dependency — it only needs `@fusion-d/types` and `express` as a peer dependency.

**Install:**

```bash
pnpm add @fusion-d/abac @fusion-d/types
```

**What it requires upstream:** `req.user` must be a `TUser` object attached by your auth middleware before `requireAbility` runs.

**Minimal example — protect a route without ownership check:**

```typescript
import { requireAbility } from '@fusion-d/abac'

// Any authenticated admin can reach this
router.delete('/admin/users/:id', authMiddleware, requireAbility('delete', 'User'), handler)
```

**Minimal example — ownership check:**

```typescript
import { requireAbility } from '@fusion-d/abac'

router.patch(
  '/items/:id',
  authMiddleware,
  requireAbility('update', 'Graph', async (req) => {
    const item = await db.findById(req.params.id)
    // Return the attributes CASL will match the ability conditions against
    return { userId: item?.userId, isPublic: item?.isPublic }
  }),
  handler,
)
```

**Standalone permission check (no Express context):**

```typescript
import { checkPermission } from '@fusion-d/abac'

const allowed = checkPermission(user, 'read', 'Graph', { isPublic: true })
```

**Extending roles or subjects:**

1. Add the new subject string to `AppSubject` in `packages/abac/src/ability.ts`
2. Add `can()`/`cannot()` rules in the relevant `case` block of `defineAbilityFor`
3. No changes needed to middleware — `requireAbility` accepts any `AppAction` / `AppSubject`

---

## 3. @fusion-d/session-store with a Different Backend

`TieredSessionStore` accepts any `IDatabase<TSession>` as its L3 layer. To use a different database, implement the `IDatabase<T>` interface from `packages/database/src/interface.ts`.

**Install:**

```bash
pnpm add @fusion-d/session-store @fusion-d/database @fusion-d/types express-session ioredis lru-cache
```

**Minimal wiring:**

```typescript
import { TieredSessionStore, MemoryLayer, RedisLayer, DbLayer } from '@fusion-d/session-store'
import session from 'express-session'

// Implement IDatabase<TSession> for your backend, or use the included adapters:
// import { MongoDBAdapter, LowDBAdapter } from '@fusion-d/database'
const sessionDb = await LowDBAdapter.create<TSession>('./data/sessions.json')

const store = new TieredSessionStore(
  new MemoryLayer(60),               // L1: 60-second in-process cache
  new RedisLayer('redis://localhost:6379'),  // L2: Redis
  new DbLayer(sessionDb),            // L3: your database
  { ttlSeconds: 86400 },
)

app.use(session({
  secret: process.env.SESSION_SECRET,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 86400000 },
}))
```

**Skipping Redis (L2 only, no L1+L2):**

`RedisLayer` degrades gracefully when disconnected — calls swallow errors. To intentionally run without Redis, simply do not call `redisLayer.connect()`. The store will miss L2 on every read and fall through to L3.

**IDatabase<TSession> contract:**

```typescript
interface IDatabase<T extends { id: string }> {
  findById(id: string): Promise<T | null>
  findOne(filter: FilterQuery<T>): Promise<T | null>
  find(filter?: FilterQuery<T>, options?: QueryOptions<T>): Promise<T[]>
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>
  update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T | null>
  delete(id: string): Promise<boolean>
  count(filter?: FilterQuery<T>): Promise<number>
}
```

`DbLayer` specifically uses `findOne({ sid })`, `create`, `update`, and `delete`. Implementing only those four methods is sufficient for session storage.

---

## 4. The gRPC Contract in a New Service

If you add a third service that needs to validate sessions or check permissions, use the `@fusion-d/proto` package directly.

**Install:**

```bash
pnpm add @fusion-d/proto @grpc/grpc-js jsonwebtoken
```

**Connecting as a client:**

```typescript
import jwt from 'jsonwebtoken'
import { createAuthClient } from '@fusion-d/proto'

const authClient = createAuthClient(
  process.env.AUTH_API_GRPC_ADDRESS,   // e.g. "localhost:50051"
  () => jwt.sign({ iss: 'my-service' }, process.env.SERVICE_JWT_SECRET, { expiresIn: 60 }),
)

// Validate a session
const result = await authClient.validateSession({ sessionId: rawSid })
if (!result.valid) throw new Error('Not authenticated')

// Check a permission
const { allowed } = await authClient.checkPermission({
  userId: result.userId,
  role: result.role,
  action: 'read',
  subject: 'Graph',
  resourceAttributes: { isPublic: 'true' },
})
```

**The `SERVICE_JWT_SECRET` must match** the value configured in `auth-api`. Both services must share the same secret. Generate it once:

```bash
openssl rand -hex 32
```

Set it as `SERVICE_JWT_SECRET` in both `.env` files.

**Cookie parsing — stripping the express-session signature:**

If your service receives the raw cookie header, strip the `s:` prefix and `.HMAC` suffix before passing the session ID to `validateSession`. The pattern from `apps/api/src/middleware/auth.ts`:

```typescript
const rawSid = req.cookies?.['sid']
const sid = rawSid?.startsWith('s:')
  ? rawSid.slice(2).replace(/\.[^.]*$/, '')  // strip "s:" and trailing ".HMAC"
  : rawSid
```

This is necessary because `express-session` signs cookies by default. The raw session ID (without the signature) is what `auth-api` stores and looks up.

> **Security:** The `SERVICE_JWT_SECRET` is a shared secret between all services. Rotate it by updating both `auth-api` and all consumer services simultaneously and redeploying. There is no key-rotation mechanism built into the current implementation — a rotation requires a coordinated restart.
