# Reizo × new-api Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new-api (`E:\CodeCode\new-api`, prod at `15.204.82.213` / `v2api.top`) the sole
authority for quota, model inference, and usage logging behind Reizo (`E:\CodeCode\winlume`,
prod at `176.122.164.148`), replacing Reizo's self-built wallet/ledger engine and Go gateway.

**Architecture:** Every Reizo team (`organizations` row) maps 1:1 to a new-api user via a new
`team_new_api_mapping` table. Team admins mint virtual `sk-...` keys that map 1:1 to new-api
tokens under that team's new-api user. A new `/v1/*` Next.js proxy authenticates the virtual
key, decrypts the underlying new-api token, and forwards to new-api. Studio uses a hidden,
auto-provisioned token the same way. See the approved design doc for full rationale:
`docs/superpowers/specs/2026-08-11-reizo-new-api-integration-design.md` — every task below
implements a section of it and should be read alongside that section.

**Tech Stack:** Next.js App Router route handlers, Drizzle ORM / Postgres, `node:crypto`
(AES-256-GCM), Vitest. No new dependencies required.

## Global Constraints

- No new-api runtime call may appear anywhere except `src/lib/newapi/**` — every other module
  goes through that adapter (design doc §4).
- `REIZO_TOKEN_ENCRYPTION_KEY` and any new-api password/PAT must never be logged, returned in
  an API response, or written to a test fixture in plaintext.
- The schema migration in Task 3 is destructive (drops tables) — `pg_dump` the production DB
  on `176.122.164.148` before applying it there (Task 13).
- No self-built billing/ledger logic may be added anywhere in this plan — new-api is the only
  quota authority (design doc §2 non-goals).
- Match existing code conventions exactly: repository classes in
  `src/lib/platform/repositories/*.ts` constructed with `(database: PlatformDatabase)`,
  registered in `src/lib/platform/repositories/index.ts`; route handlers follow the
  try/catch + `consoleJson`/`consoleError` or `NextResponse.json` pattern already used in
  `src/app/api/console/**` and `src/app/api/account/[action]/route.ts`.

---

## Task 1: Verify new-api registration prerequisites (no code)

This is a verification task, not a code task — it produces the `NEW_API_ADMIN_TOKEN` value
and confirms two config flags without which Task 7's registration flow cannot work. Do this
first; every later task assumes its findings.

**Files:** none (SSH-only, use the `connect-new-api-server-15-204-82-213` skill for
connection details to `15.204.82.213`).

- [ ] **Step 1: Confirm password login and Turnstile settings**

Design doc §5.2 flags that `POST /api/user/login` is gated by
`common.PasswordLoginEnabled` and `middleware.TurnstileCheck()` (a no-op unless
`common.TurnstileCheckEnabled`). Both are driven by the `options` table. Run on the box:

```bash
sudo -u postgres psql -d <new-api-db> -c \
  "SELECT key, value FROM options WHERE key IN ('PasswordLoginEnabled','TurnstileCheckEnabled');"
```

(Substitute the actual DB name/DSN from `/etc/new-api/native.env` `SQL_DSN`, per the
`connect-new-api-server-15-204-82-213` skill's "Querying the database" section — don't
hardcode a guessed DSN.) Expected: `PasswordLoginEnabled` is `true` (or absent, meaning
default-enabled) and `TurnstileCheckEnabled` is `false`/absent. If `TurnstileCheckEnabled`
is `true`, stop and flag this to the user before continuing — Task 7's automated login
step will fail and needs either a service-side Turnstile bypass or a design change.

- [ ] **Step 2: Obtain or create a dedicated new-api admin account and mint its PAT**

Check whether a dedicated admin/root account already exists for automation (do not reuse
a human operator's personal account). If one needs creating, use the new-api admin
dashboard (or `psql` insert matching `model.User`'s shape) to create a `RoleAdminUser`
(or `RoleRootUser`) account, then log in as it via the dashboard and call
`GET /api/user/self/token` (or use the dashboard's "生成访问令牌" UI) to mint its PAT.

- [ ] **Step 3: Record the PAT for Task 12's env var rollout**

Store the minted PAT securely (password manager / secrets store — not in any file in this
repo) for use as `NEW_API_ADMIN_TOKEN` when populating `/opt/reizo/.env` in Task 13. Do
not commit it anywhere.

---

## Task 2: AES-256-GCM secret encryption helper

**Files:**
- Create: `src/lib/newapi/crypto.ts`
- Test: `src/lib/newapi/crypto.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plaintext: string, key?: string): string`,
  `decryptSecret(ciphertext: string, key?: string): string`,
  `class MissingEncryptionKeyError extends Error`. `key` defaults to
  `process.env.REIZO_TOKEN_ENCRYPTION_KEY`; every later task that stores/reads a new-api
  secret imports these two functions and nothing else from this file.

This mirrors the key-derivation convention already used in
`scripts/migrate-new-api.ts:1291-1302` (`deriveEncryptionKey`) so operators can reuse the
same key format (hex-64, base64-32-byte, or a passphrase run through SHA-256), but adds a
`decrypt` counterpart that migration script doesn't need.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/newapi/crypto.test.ts
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, MissingEncryptionKeyError } from "./crypto";

const KEY_HEX = "a".repeat(64); // 32 bytes, valid hex key

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const ciphertext = encryptSecret("sk-abc123", KEY_HEX);
    expect(ciphertext).not.toContain("sk-abc123");
    expect(decryptSecret(ciphertext, KEY_HEX)).toBe("sk-abc123");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptSecret("same-value", KEY_HEX);
    const b = encryptSecret("same-value", KEY_HEX);
    expect(a).not.toBe(b);
  });

  it("accepts a base64 32-byte key", () => {
    const base64Key = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptSecret("value", base64Key);
    expect(decryptSecret(ciphertext, base64Key)).toBe("value");
  });

  it("derives a key from an arbitrary passphrase", () => {
    const ciphertext = encryptSecret("value", "not-a-32-byte-key");
    expect(decryptSecret(ciphertext, "not-a-32-byte-key")).toBe("value");
  });

  it("fails decryption with the wrong key", () => {
    const ciphertext = encryptSecret("value", KEY_HEX);
    expect(() => decryptSecret(ciphertext, "b".repeat(64))).toThrow();
  });

  it("throws MissingEncryptionKeyError when no key is configured", () => {
    const original = process.env.REIZO_TOKEN_ENCRYPTION_KEY;
    delete process.env.REIZO_TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => encryptSecret("value")).toThrow(MissingEncryptionKeyError);
    } finally {
      if (original !== undefined) process.env.REIZO_TOKEN_ENCRYPTION_KEY = original;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/newapi/crypto.test.ts`
Expected: FAIL — `Cannot find module './crypto'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/newapi/crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("REIZO_TOKEN_ENCRYPTION_KEY is required to encrypt/decrypt new-api secrets.");
    this.name = "MissingEncryptionKeyError";
  }
}

function resolveKey(key?: string): string {
  const value = key ?? process.env.REIZO_TOKEN_ENCRYPTION_KEY;
  if (!value || !value.trim()) throw new MissingEncryptionKeyError();
  return value.trim();
}

function deriveKey(input: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(input)) return Buffer.from(input, "hex");
  try {
    const decoded = Buffer.from(input, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to KDF
  }
  return createHash("sha256").update(input, "utf8").digest();
}

/** AES-256-GCM encrypt. Output packs iv/tag/ciphertext into one base64url string. */
export function encryptSecret(plaintext: string, key?: string): string {
  const derivedKey = deriveKey(resolveKey(key));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(packed: string, key?: string): string {
  const derivedKey = deriveKey(resolveKey(key));
  const [ivPart, tagPart, ciphertextPart] = packed.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted secret: expected iv.tag.ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/newapi/crypto.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/newapi/crypto.ts src/lib/newapi/crypto.test.ts
git commit -m "feat(newapi): add AES-256-GCM secret encryption helper"
```

---

## Task 3: Schema changes — team/new-api mapping, extended api_keys, drop billing tables

**Files:**
- Modify: `src/lib/platform/db/schema.ts`
- Modify: `src/lib/platform/types.ts` (no enum changes needed — skip if nothing to add)
- Delete: `src/lib/platform/db/gateway-schema.test.ts` (tests tables this task drops)
- Generate: `drizzle/000X_*.sql` (via `drizzle-kit generate`, filename assigned by the tool)

**Interfaces:**
- Produces: `teamNewApiMapping` table export from `schema.ts` with columns
  `organizationId` (uuid, PK, FK→`organizations.id`), `newApiUserId` (integer, unique),
  `newApiUsername` (varchar 64), `newApiPasswordCiphertext` (text),
  `newApiPatCiphertext` (text), `createdAt`, `updatedAt`. `apiKeys` gains `newApiTokenId`
  (integer, nullable), `newApiKeyCiphertext` (text, nullable — see note below),
  `isStudioHidden` (boolean, default false). `users` gains `currentOrganizationId` (uuid,
  nullable, FK→`organizations.id` `ON DELETE SET NULL`).

Design doc §3.4 says `new_api_key_ciphertext` is `NOT NULL`; make it **nullable** at the
schema level instead — existing rows (if any survive past the "not launched" cutoff) and
the brief window inside Task 7/8's transaction between key row creation and ciphertext
assignment are both easier to model as nullable-then-backfilled than as a `NOT NULL`
column requiring a default. Application code in Tasks 7/8 always sets it at insert time,
so this is a safety margin, not a design change.

- [ ] **Step 1: Add `currentOrganizationId` to `users`**

Edit `src/lib/platform/db/schema.ts`, inside the `users` table definition
(currently lines 69-92), add the column and its FK. Drizzle requires forward references
to `organizations` to be handled via a plain `uuid(...)` column with a manually-added FK
in the same file (organizations is defined later in the file, at line 113) — use a
string-based `.references()` callback, which Drizzle resolves lazily:

```typescript
// inside the users pgTable columns object, after isServiceAccount:
    currentOrganizationId: uuid("current_organization_id"),
```

Add the FK as a table-level constraint in the third argument (the callback array), after
the existing indexes:

```typescript
  (table) => [
    uniqueIndex("users_username_unique").on(table.username),
    index("users_status_index").on(table.status),
    foreignKey({
      columns: [table.currentOrganizationId],
      foreignColumns: [organizations.id],
      name: "users_current_organization_fk",
    }).onDelete("set null"),
  ],
```

This requires `foreignKey` in the import list at the top of the file — add it to the
existing `drizzle-orm/pg-core` import (line 2-17).

- [ ] **Step 2: Add the `team_new_api_mapping` table**

Add this new export directly after the `organizationMemberships` table definition
(currently ending at line 143), before `apiKeys`:

```typescript
export const teamNewApiMapping = pgTable(
  "team_new_api_mapping",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    newApiUserId: integer("new_api_user_id").notNull(),
    newApiUsername: varchar("new_api_username", { length: 64 }).notNull(),
    newApiPasswordCiphertext: text("new_api_password_ciphertext").notNull(),
    newApiPatCiphertext: text("new_api_pat_ciphertext").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("team_new_api_mapping_user_id_unique").on(table.newApiUserId)],
);
```

- [ ] **Step 3: Extend `apiKeys`**

In the `apiKeys` table definition (currently lines 145-173): remove the
`quotaLimitMicrocredits` line, and add three new columns after `metadata`:

```typescript
    newApiTokenId: integer("new_api_token_id"),
    newApiKeyCiphertext: text("new_api_key_ciphertext"),
    isStudioHidden: boolean("is_studio_hidden").notNull().default(false),
```

- [ ] **Step 4: Delete the dropped-table exports**

Remove these `pgTable(...)` exports entirely from `schema.ts` (and their now-unused
`pgEnum` declarations at the top of the file, if not referenced elsewhere after removal —
check each enum name against the remaining file before deleting it): `wallets`,
`walletLedgerEntries`, `usageEvents`, `apiKeyQuotaLedgerEntries`, `billingShadowEvents`,
`gatewayRelayAttempts`, `billingProfiles`, `apiKeyBillingPolicies`,
`pricingCatalogVersions`, `pricingModelRules`, `pricingGroupRules`, `modelAvailability`,
`subscriptionPlans`, `subscriptions`, `subscriptionQuotaStates`,
`subscriptionQuotaLedgerEntries`, `paymentProviders`, `paymentOrders`,
`enterpriseBillingRequests`, `channels`. Keep `personalityPresets`, `toolPresets`,
`authIdentities`, `users`, `organizations`, `organizationMemberships`, `apiKeys`.

- [ ] **Step 5: Delete the now-obsolete schema test**

```bash
git rm src/lib/platform/db/gateway-schema.test.ts
```

It asserts on enums/tables this task removes; there is no replacement assertion needed
for dropped tables (nothing to test once they don't exist).

- [ ] **Step 6: Generate the migration**

Run: `npm run db:generate`
Expected: a new file under `drizzle/` (e.g. `drizzle/0004_<generated-name>.sql`)
containing `CREATE TABLE "team_new_api_mapping"`, `ALTER TABLE "users" ADD COLUMN
"current_organization_id"`, `ALTER TABLE "api_keys" ADD COLUMN "new_api_token_id"` /
`"new_api_key_ciphertext"` / `"is_studio_hidden"`, `ALTER TABLE "api_keys" DROP COLUMN
"quota_limit_microcredits"`, and `DROP TABLE` statements for every table in Step 4.
Inspect the generated SQL before proceeding — drizzle-kit sometimes asks interactively
about renamed vs. dropped+created columns; if prompted, confirm these are drops/creates,
not renames (there is no data to preserve).

- [ ] **Step 7: Apply the migration to the local/dev database**

Run: `npm run db:migrate`
Expected: exits 0, no errors. If there is no local dev database configured, note this
step must be re-run against production in Task 13 instead — do not skip verifying the SQL
itself compiles/applies against at least one Postgres instance before Task 13.

- [ ] **Step 8: Commit**

```bash
git add src/lib/platform/db/schema.ts drizzle/ 
git rm src/lib/platform/db/gateway-schema.test.ts
git commit -m "feat(schema): add team/new-api mapping, extend api_keys, drop billing engine tables"
```

---

## Task 4: new-api admin-scoped client

**Files:**
- Create: `src/lib/newapi/admin-client.ts`
- Test: `src/lib/newapi/admin-client.test.ts`

**Interfaces:**
- Consumes: `process.env.NEW_API_URL`, `process.env.NEW_API_ADMIN_TOKEN`.
- Produces: `createNewApiUser(input: { username: string; password: string; displayName: string }): Promise<void>`,
  `findNewApiUserIdByUsername(username: string): Promise<number | null>`,
  `disableNewApiUser(newApiUserId: number): Promise<void>`,
  `addNewApiUserQuota(newApiUserId: number, amount: number): Promise<void>`,
  `getNewApiUserQuota(newApiUserId: number): Promise<{ quota: number; usedQuota: number }>`,
  `class NewApiAdminError extends Error { status: number }`. Later tasks (7, 9, 12) import
  from this module for every admin-PAT-scoped call.

Endpoints and field names below are verified against `E:\CodeCode\new-api` source, not
guessed (design doc §4, §5.2):
- `POST /api/user/` — body `{username, password, display_name, role}` (`role: 1` = common
  user, per `common.RoleCommonUser` in new-api's `common` package — pass `role: 1`
  explicitly rather than omitting it, since the zero value could resolve differently).
  Response has no id (`controller/user.go:1086-1090`, just `{success, message}`).
- `GET /api/user/search?keyword=<username>` (admin) — to recover the id after creation.
- `POST /api/user/manage` — body `{id, action, value, mode}` (`controller/user.go:1109-1114`).
  `action: "disable"` for compensation. `action: "add_quota", mode: "add", value: amount`
  for topping up.
- `GET /api/user/:id` (admin) — response `data: {id, username, quota, used_quota, ...}`
  (`model/user.go:80-97`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/newapi/admin-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addNewApiUserQuota,
  createNewApiUser,
  disableNewApiUser,
  findNewApiUserIdByUsername,
  getNewApiUserQuota,
  NewApiAdminError,
} from "./admin-client";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEW_API_URL = "https://v2api.top";
  process.env.NEW_API_ADMIN_TOKEN = "admin-pat-123";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("createNewApiUser", () => {
  it("posts to /api/user/ with the admin PAT and role=1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, message: "" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createNewApiUser({ username: "team-abc", password: "s3cret!!", displayName: "Team ABC" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://v2api.top/api/user/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer admin-pat-123" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ username: "team-abc", password: "s3cret!!", display_name: "Team ABC", role: 1 });
  });

  it("throws NewApiAdminError when new-api reports failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message: "duplicate" }), { status: 200 })),
    );
    await expect(
      createNewApiUser({ username: "dupe", password: "s3cret!!", displayName: "Dupe" }),
    ).rejects.toThrow(NewApiAdminError);
  });
});

describe("findNewApiUserIdByUsername", () => {
  it("returns the matching user's id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { items: [{ id: 42, username: "team-abc" }] } }),
          { status: 200 },
        ),
      ),
    );
    await expect(findNewApiUserIdByUsername("team-abc")).resolves.toBe(42);
  });

  it("returns null when no user matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { items: [] } }), { status: 200 })),
    );
    await expect(findNewApiUserIdByUsername("nobody")).resolves.toBeNull();
  });
});

describe("addNewApiUserQuota", () => {
  it("posts action=add_quota mode=add", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await addNewApiUserQuota(42, 500000);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ id: 42, action: "add_quota", mode: "add", value: 500000 });
  });
});

describe("disableNewApiUser", () => {
  it("posts action=disable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await disableNewApiUser(42);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ id: 42, action: "disable" });
  });
});

describe("getNewApiUserQuota", () => {
  it("maps quota/used_quota from GET /api/user/:id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { id: 42, quota: 1000, used_quota: 250 } }), { status: 200 }),
      ),
    );
    await expect(getNewApiUserQuota(42)).resolves.toEqual({ quota: 1000, usedQuota: 250 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/newapi/admin-client.test.ts`
Expected: FAIL — `Cannot find module './admin-client'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/newapi/admin-client.ts
export class NewApiAdminError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "NewApiAdminError";
  }
}

function baseUrl(): string {
  const configured = process.env.NEW_API_URL?.trim();
  if (!configured) throw new Error("NEW_API_URL is not configured.");
  return configured.replace(/\/+$/, "");
}

function adminHeaders(): Record<string, string> {
  const token = process.env.NEW_API_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("NEW_API_ADMIN_TOKEN is not configured.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

interface NewApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}

async function adminRequest<T>(path: string, init: RequestInit): Promise<T | undefined> {
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers: adminHeaders(), cache: "no-store" });
  const text = await response.text();
  let payload: NewApiEnvelope<T>;
  try {
    payload = JSON.parse(text) as NewApiEnvelope<T>;
  } catch {
    throw new NewApiAdminError(`new-api returned non-JSON response (${response.status})`, response.status);
  }
  if (!response.ok || !payload.success) {
    throw new NewApiAdminError(payload.message || `new-api admin request failed (${response.status})`, response.status);
  }
  return payload.data;
}

export async function createNewApiUser(input: { username: string; password: string; displayName: string }): Promise<void> {
  await adminRequest("/api/user/", {
    method: "POST",
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      display_name: input.displayName,
      role: 1,
    }),
  });
}

export async function findNewApiUserIdByUsername(username: string): Promise<number | null> {
  const data = await adminRequest<{ items: { id: number; username: string }[] }>(
    `/api/user/search?keyword=${encodeURIComponent(username)}`,
    { method: "GET" },
  );
  const match = data?.items.find((item) => item.username === username);
  return match?.id ?? null;
}

export async function disableNewApiUser(newApiUserId: number): Promise<void> {
  await adminRequest("/api/user/manage", {
    method: "POST",
    body: JSON.stringify({ id: newApiUserId, action: "disable" }),
  });
}

export async function addNewApiUserQuota(newApiUserId: number, amount: number): Promise<void> {
  await adminRequest("/api/user/manage", {
    method: "POST",
    body: JSON.stringify({ id: newApiUserId, action: "add_quota", mode: "add", value: amount }),
  });
}

export async function getNewApiUserQuota(newApiUserId: number): Promise<{ quota: number; usedQuota: number }> {
  const data = await adminRequest<{ quota: number; used_quota: number }>(`/api/user/${newApiUserId}`, { method: "GET" });
  if (!data) throw new NewApiAdminError("new-api returned no user data", 502);
  return { quota: data.quota, usedQuota: data.used_quota };
}
```

Note: `GET /api/user/search` pagination shape (`data.items`) matches the `pageInfo`
convention used elsewhere in new-api's admin list endpoints
(`common.GetPageQuery`/`pageInfo.SetItems`, seen in `controller/token.go`'s
`GetAllTokens`/`SearchTokens`) — if a live smoke test in Task 12 shows a different envelope
key (e.g. `records` instead of `items`), fix this function and its test together rather
than guessing further; treat this field name as the one item in this task not verified
against literal search-controller source (only inferred by convention).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/newapi/admin-client.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/newapi/admin-client.ts src/lib/newapi/admin-client.test.ts
git commit -m "feat(newapi): add admin-scoped client for user create/quota/manage"
```

---

## Task 5: new-api team-scoped client (login, PAT mint, token CRUD, usage)

**Files:**
- Create: `src/lib/newapi/team-client.ts`
- Test: `src/lib/newapi/team-client.test.ts`

**Interfaces:**
- Consumes: `process.env.NEW_API_URL`.
- Produces: `loginAndMintPat(username: string, password: string): Promise<string>`,
  `createTeamToken(pat: string, name: string): Promise<void>`,
  `findTeamTokenIdByName(pat: string, name: string): Promise<number | null>`,
  `fetchTeamTokenKey(pat: string, tokenId: number): Promise<string>`,
  `revokeTeamToken(pat: string, tokenId: number): Promise<void>`,
  `getTokenUsage(tokenSk: string): Promise<{ totalGranted: number; totalUsed: number; totalAvailable: number }>`,
  `class NewApiTeamError extends Error { status: number }`. Task 7 uses
  `loginAndMintPat`/`createTeamToken`/`findTeamTokenIdByName`/`fetchTeamTokenKey`; Task 9
  uses the token CRUD trio; Task 11 uses `getTokenUsage`.

Verified against source (design doc §5.2, §4):
- `POST /api/user/login` body `{username, password}` (`controller/user.go` `LoginRequest`)
  sets a session cookie (`Set-Cookie` header) rather than returning a bearer token — this
  client must capture that cookie and replay it on the very next request.
- `GET /api/user/self/token` (same session cookie) → `{success, message, data: "<pat>"}`
  (a raw string, `controller/user.go:451-455`).
- `POST /api/token/` body is `model.Token`-shaped; required fields per
  `controller/token.go:264-352`: `name` (string), `group` (non-empty string — new-api
  users default to group `"default"` per `model/user.go:99`, so pass `"default"`),
  `remain_quota` (int, ignored when `unlimited_quota: true`), `unlimited_quota` (bool),
  `expired_time` (int64 unix seconds, `-1` = never). Response has no id/key
  (`{success, message}` only).
- `GET /api/token/search?keyword=<name>` — to recover the id after creation (same
  pattern as user search; response shape `{success, data: {items: [...]}}`, per
  `controller/token.go:133-148`'s `SearchTokens` using the same `pageInfo` convention).
- `POST /api/token/:id/key` → `{success, data: {key: "<raw-key-no-sk-prefix>"}}`
  (`controller/token.go:177-192`, `GetFullKey()` returns the bare key per
  `model/token.go:76-78` — the `sk-` prefix is a client-side convention, not stored).
- `DELETE /api/token/:id`.
- `GET /api/usage/token/` with `Authorization: Bearer sk-<key>` (the token's own key, not
  a PAT) → `{code, message, data: {total_granted, total_used, total_available, ...}}`
  (`controller/token.go:215-262`).

All token-scoped calls (everything except `loginAndMintPat`) take the caller-supplied
`pat` as a parameter rather than reading an env var — callers (Task 7, 9, 11) decrypt the
team's `new_api_pat_ciphertext` first and pass the plaintext PAT in.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/newapi/team-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTeamToken,
  fetchTeamTokenKey,
  findTeamTokenIdByName,
  getTokenUsage,
  loginAndMintPat,
  NewApiTeamError,
  revokeTeamToken,
} from "./team-client";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEW_API_URL = "https://v2api.top";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("loginAndMintPat", () => {
  it("logs in, carries the session cookie into the PAT-mint call, and returns the PAT", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/user/login")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "set-cookie": "session=abc123; Path=/; HttpOnly" },
        });
      }
      if (url.endsWith("/api/user/self/token")) {
        return new Response(JSON.stringify({ success: true, data: "pat-xyz" }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginAndMintPat("team-abc", "s3cret!!")).resolves.toBe("pat-xyz");

    const [, patCallInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((patCallInit.headers as Record<string, string>).Cookie).toContain("session=abc123");
  });

  it("throws NewApiTeamError on login failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message: "bad password" }), { status: 200 })),
    );
    await expect(loginAndMintPat("team-abc", "wrong")).rejects.toThrow(NewApiTeamError);
  });
});

describe("createTeamToken / findTeamTokenIdByName / fetchTeamTokenKey", () => {
  it("creates a token with group=default and unlimited quota", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createTeamToken("pat-xyz", "studio");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/api/token/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pat-xyz");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "studio",
      group: "default",
      remain_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
    });
  });

  it("finds a token id by exact name match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { items: [{ id: 7, name: "studio" }] } }), { status: 200 }),
      ),
    );
    await expect(findTeamTokenIdByName("pat-xyz", "studio")).resolves.toBe(7);
  });

  it("fetches the raw key and prefixes sk-", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { key: "rawkey123" } }), { status: 200 })),
    );
    await expect(fetchTeamTokenKey("pat-xyz", 7)).resolves.toBe("sk-rawkey123");
  });
});

describe("revokeTeamToken", () => {
  it("sends DELETE /api/token/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeTeamToken("pat-xyz", 7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/api/token/7");
    expect(init.method).toBe("DELETE");
  });
});

describe("getTokenUsage", () => {
  it("authenticates with the token's own sk- key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: true, message: "ok", data: { total_granted: 1000, total_used: 250, total_available: 750 } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getTokenUsage("sk-rawkey123")).resolves.toEqual({
      totalGranted: 1000,
      totalUsed: 250,
      totalAvailable: 750,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/api/usage/token/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-rawkey123");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/newapi/team-client.test.ts`
Expected: FAIL — `Cannot find module './team-client'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/newapi/team-client.ts
export class NewApiTeamError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "NewApiTeamError";
  }
}

function baseUrl(): string {
  const configured = process.env.NEW_API_URL?.trim();
  if (!configured) throw new Error("NEW_API_URL is not configured.");
  return configured.replace(/\/+$/, "");
}

interface NewApiEnvelope<T> {
  success?: boolean;
  code?: boolean;
  message?: string;
  data?: T;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: NewApiEnvelope<T>;
  try {
    payload = JSON.parse(text) as NewApiEnvelope<T>;
  } catch {
    throw new NewApiTeamError(`new-api returned non-JSON response (${response.status})`, response.status);
  }
  const ok = payload.success ?? payload.code ?? false;
  if (!response.ok || !ok) {
    throw new NewApiTeamError(payload.message || `new-api request failed (${response.status})`, response.status);
  }
  if (payload.data === undefined) throw new NewApiTeamError("new-api returned no data", response.status);
  return payload.data;
}

/** Logs in as the team's new-api user, then mints and returns a fresh PAT for it. */
export async function loginAndMintPat(username: string, password: string): Promise<string> {
  const loginResponse = await fetch(`${baseUrl()}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  const setCookie = loginResponse.headers.get("set-cookie");
  await parseEnvelope<unknown>(loginResponse);
  if (!setCookie) throw new NewApiTeamError("new-api login did not return a session cookie", loginResponse.status);
  const sessionCookie = setCookie.split(";")[0];

  const patResponse = await fetch(`${baseUrl()}/api/user/self/token`, {
    method: "GET",
    headers: { Cookie: sessionCookie },
    cache: "no-store",
  });
  return parseEnvelope<string>(patResponse);
}

function teamHeaders(pat: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${pat}` };
}

export async function createTeamToken(pat: string, name: string): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/token/`, {
    method: "POST",
    headers: teamHeaders(pat),
    body: JSON.stringify({ name, group: "default", remain_quota: 0, unlimited_quota: true, expired_time: -1 }),
    cache: "no-store",
  });
  await parseEnvelope<unknown>(response);
}

export async function findTeamTokenIdByName(pat: string, name: string): Promise<number | null> {
  const response = await fetch(`${baseUrl()}/api/token/search?keyword=${encodeURIComponent(name)}`, {
    method: "GET",
    headers: teamHeaders(pat),
    cache: "no-store",
  });
  const data = await parseEnvelope<{ items: { id: number; name: string }[] }>(response);
  return data.items.find((item) => item.name === name)?.id ?? null;
}

export async function fetchTeamTokenKey(pat: string, tokenId: number): Promise<string> {
  const response = await fetch(`${baseUrl()}/api/token/${tokenId}/key`, {
    method: "POST",
    headers: teamHeaders(pat),
    cache: "no-store",
  });
  const data = await parseEnvelope<{ key: string }>(response);
  return `sk-${data.key}`;
}

export async function revokeTeamToken(pat: string, tokenId: number): Promise<void> {
  const response = await fetch(`${baseUrl()}/api/token/${tokenId}`, {
    method: "DELETE",
    headers: teamHeaders(pat),
    cache: "no-store",
  });
  await parseEnvelope<unknown>(response);
}

export async function getTokenUsage(
  tokenSk: string,
): Promise<{ totalGranted: number; totalUsed: number; totalAvailable: number }> {
  const response = await fetch(`${baseUrl()}/api/usage/token/`, {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenSk}` },
    cache: "no-store",
  });
  const data = await parseEnvelope<{ total_granted: number; total_used: number; total_available: number }>(response);
  return { totalGranted: data.total_granted, totalUsed: data.total_used, totalAvailable: data.total_available };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/newapi/team-client.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/newapi/team-client.ts src/lib/newapi/team-client.test.ts
git commit -m "feat(newapi): add team-scoped client for login/PAT-mint/token CRUD/usage"
```

---

## Task 6: `TeamNewApiMappingRepository`

**Files:**
- Create: `src/lib/platform/repositories/team-new-api-mapping.ts`
- Test: `src/lib/platform/repositories/team-new-api-mapping.test.ts`
- Modify: `src/lib/platform/repositories/index.ts`

**Interfaces:**
- Consumes: `teamNewApiMapping` table from Task 3, `PlatformDatabase` type from
  `src/lib/platform/db/client.ts`.
- Produces: `class TeamNewApiMappingRepository` with
  `create(tx, input: {organizationId, newApiUserId, newApiUsername, newApiPasswordCiphertext, newApiPatCiphertext}): Promise<TeamNewApiMappingRecord>`
  (takes an explicit `tx` param — see note below), and
  `findByOrganizationId(organizationId: string): Promise<TeamNewApiMappingRecord | null>`.
  Registered as `repositories.teamNewApiMapping` on `PlatformRepositories`. Task 7 uses
  `create` inside its own transaction; Tasks 9 and 11 use `findByOrganizationId`.

Unlike the other repositories in this codebase (`ApiKeyRepository`, `OrganizationRepository`),
`create` here takes the transaction handle as an explicit first parameter instead of opening
its own `this.database.transaction(...)` — Task 7's registration flow needs to insert into
`users`, `organizations`, `organizationMemberships`, `teamNewApiMapping`, and `apiKeys` all
inside **one** transaction, so this repository must be composable into someone else's `tx`
rather than owning its own.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/platform/repositories/team-new-api-mapping.test.ts
import { describe, expect, it } from "vitest";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";

describe("TeamNewApiMappingRepository.create", () => {
  it("inserts a mapping row using the provided transaction handle", async () => {
    const inserted = {
      organizationId: "org-1",
      newApiUserId: 42,
      newApiUsername: "team-abc",
      newApiPasswordCiphertext: "enc-pw",
      newApiPatCiphertext: "enc-pat",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const values = { returning: () => Promise.resolve([inserted]) };
    const insert = () => ({ values: () => values });
    const fakeTx = { insert } as unknown as Parameters<TeamNewApiMappingRepository["create"]>[0];

    const repository = new TeamNewApiMappingRepository();
    const result = await repository.create(fakeTx, {
      organizationId: "org-1",
      newApiUserId: 42,
      newApiUsername: "team-abc",
      newApiPasswordCiphertext: "enc-pw",
      newApiPatCiphertext: "enc-pat",
    });
    expect(result).toEqual(inserted);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/platform/repositories/team-new-api-mapping.test.ts`
Expected: FAIL — `Cannot find module './team-new-api-mapping'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/platform/repositories/team-new-api-mapping.ts
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { teamNewApiMapping } from "../db/schema";

export type TeamNewApiMappingRecord = InferSelectModel<typeof teamNewApiMapping>;

export interface CreateTeamNewApiMappingInput {
  organizationId: string;
  newApiUserId: number;
  newApiUsername: string;
  newApiPasswordCiphertext: string;
  newApiPatCiphertext: string;
}

type Transaction = Pick<PlatformDatabase, "insert">;

export class TeamNewApiMappingRepository {
  constructor(private readonly database?: PlatformDatabase) {}

  async create(tx: Transaction, input: CreateTeamNewApiMappingInput): Promise<TeamNewApiMappingRecord> {
    const [record] = await tx
      .insert(teamNewApiMapping)
      .values({
        organizationId: input.organizationId,
        newApiUserId: input.newApiUserId,
        newApiUsername: input.newApiUsername,
        newApiPasswordCiphertext: input.newApiPasswordCiphertext,
        newApiPatCiphertext: input.newApiPatCiphertext,
      })
      .returning();
    if (!record) throw new Error("Failed to create team/new-api mapping.");
    return record;
  }

  async findByOrganizationId(organizationId: string): Promise<TeamNewApiMappingRecord | null> {
    if (!this.database) throw new Error("TeamNewApiMappingRepository was constructed without a database.");
    const [record] = await this.database
      .select()
      .from(teamNewApiMapping)
      .where(eq(teamNewApiMapping.organizationId, organizationId))
      .limit(1);
    return record ?? null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/platform/repositories/team-new-api-mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Register in `PlatformRepositories`**

Edit `src/lib/platform/repositories/index.ts`:

```typescript
import { getPlatformDb, type PlatformDatabase } from "../db/client";
import { ApiKeyRepository } from "./api-keys";
import { AuthIdentityRepository } from "./auth-identities";
import { BillingRepository } from "./billing";
import { OrganizationRepository } from "./organizations";
import { PresetRepository } from "./presets";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";
import { UserRepository } from "./users";
import { WalletRepository } from "./wallet";

export class PlatformRepositories {
  readonly users: UserRepository;
  readonly identities: AuthIdentityRepository;
  readonly organizations: OrganizationRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly billing: BillingRepository;
  readonly wallets: WalletRepository;
  readonly presets: PresetRepository;
  readonly teamNewApiMapping: TeamNewApiMappingRepository;

  constructor(database: PlatformDatabase) {
    this.users = new UserRepository(database);
    this.identities = new AuthIdentityRepository(database);
    this.organizations = new OrganizationRepository(database);
    this.apiKeys = new ApiKeyRepository(database);
    this.billing = new BillingRepository(database);
    this.wallets = new WalletRepository(database);
    this.presets = new PresetRepository(database);
    this.teamNewApiMapping = new TeamNewApiMappingRepository(database);
  }
}

export function getPlatformRepositories(): PlatformRepositories | null {
  const database = getPlatformDb();
  return database ? new PlatformRepositories(database) : null;
}

export * from "./api-keys";
export * from "./auth-identities";
export * from "./billing";
export * from "./organizations";
export * from "./presets";
export * from "./team-new-api-mapping";
export * from "./users";
export * from "./wallet";
```

(`billing` and `wallets` repositories/exports are removed in Task 8 once nothing
references the dropped tables — leave them alone in this task to keep the diff focused.)

- [ ] **Step 6: Run the full repositories test suite**

Run: `npx vitest run src/lib/platform/repositories`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/platform/repositories/team-new-api-mapping.ts \
        src/lib/platform/repositories/team-new-api-mapping.test.ts \
        src/lib/platform/repositories/index.ts
git commit -m "feat(platform): add TeamNewApiMappingRepository"
```

---

## Task 7: New-api-first registration transaction

**Files:**
- Modify: `src/lib/platform/provision.ts`
- Test: `src/lib/platform/provision.test.ts` (new — none exists today)

**Interfaces:**
- Consumes: `createNewApiUser`, `findNewApiUserIdByUsername`, `disableNewApiUser` (Task 4);
  `loginAndMintPat`, `createTeamToken`, `findTeamTokenIdByName`, `fetchTeamTokenKey`
  (Task 5); `encryptSecret` (Task 2); `TeamNewApiMappingRepository.create` (Task 6);
  `hashApiKey`/`generateApiKey`-style prefix logic from `src/lib/platform/api-keys.ts`
  (reuse `generateApiKey()` as-is for the Studio key's Reizo-side `sk-`/hash — the new-api
  key it maps to is a separate, independently-generated secret per design doc §5.3).
- Produces: `provisionPlatformUser(database, input): Promise<PlatformUserRecord>` — same
  exported signature as today, callers in `src/app/api/account/[action]/route.ts` and any
  OAuth first-login path are unaffected.

Implements design doc §5.1 exactly: new-api user → login → mint PAT → create+fetch studio
token → local transaction (user, org, membership, mapping, hidden studio api_key row) →
compensation on local failure.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/platform/provision.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const newApiState = { nextUserId: 100, nextTokenId: 1 };

vi.mock("../newapi/admin-client", () => ({
  createNewApiUser: vi.fn(async () => {}),
  findNewApiUserIdByUsername: vi.fn(async () => newApiState.nextUserId),
  disableNewApiUser: vi.fn(async () => {}),
}));

vi.mock("../newapi/team-client", () => ({
  loginAndMintPat: vi.fn(async () => "pat-xyz"),
  createTeamToken: vi.fn(async () => {}),
  findTeamTokenIdByName: vi.fn(async () => newApiState.nextTokenId),
  fetchTeamTokenKey: vi.fn(async () => "sk-newapi-raw-key"),
}));

import { createNewApiUser, disableNewApiUser } from "../newapi/admin-client";
import { provisionPlatformUser } from "./provision";

function fakeDatabase(overrides: { txShouldFail?: boolean } = {}) {
  const inserted: Record<string, unknown[]> = {};
  const tx = {
    insert: (table: { _: { name: string } } | { name?: string }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (overrides.txShouldFail) throw new Error("simulated tx failure");
          const key = JSON.stringify(Object.keys(values));
          inserted[key] = inserted[key] ?? [];
          const row = { id: "generated-id", ...values };
          inserted[key].push(row);
          return [row];
        },
      }),
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };
  return {
    transaction: async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx),
  } as unknown as Parameters<typeof provisionPlatformUser>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionPlatformUser", () => {
  it("creates the new-api user before touching local storage", async () => {
    const database = fakeDatabase();
    await provisionPlatformUser(database, { username: "team-abc", displayName: "Team ABC", passwordHash: "hash" });
    expect(createNewApiUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: "team-abc", displayName: "Team ABC" }),
    );
  });

  it("attempts to disable the new-api user if the local transaction fails", async () => {
    const database = fakeDatabase({ txShouldFail: true });
    await expect(
      provisionPlatformUser(database, { username: "team-abc", displayName: "Team ABC", passwordHash: "hash" }),
    ).rejects.toThrow();
    expect(disableNewApiUser).toHaveBeenCalledWith(newApiState.nextUserId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/platform/provision.test.ts`
Expected: FAIL — `createNewApiUser` not called (current implementation has no new-api
integration yet).

- [ ] **Step 3: Rewrite the implementation**

```typescript
// src/lib/platform/provision.ts
import { randomBytes } from "node:crypto";
import { generateApiKey } from "./api-keys";
import type { PlatformDatabase } from "./db/client";
import { apiKeys, organizationMemberships, organizations, users } from "./db/schema";
import { encryptSecret } from "../newapi/crypto";
import { createNewApiUser, disableNewApiUser, findNewApiUserIdByUsername } from "../newapi/admin-client";
import { createTeamToken, fetchTeamTokenKey, findTeamTokenIdByName, loginAndMintPat } from "../newapi/team-client";
import { normalizeEmail, normalizeUsername, type PlatformUserRecord } from "./repositories/users";
import type { PlatformRole, UserStatus } from "./types";

export interface ProvisionPlatformUserInput {
  username: string;
  displayName?: string;
  email?: string | null;
  passwordHash?: string | null;
  image?: string | null;
  emailVerifiedAt?: Date | null;
  platformRole?: PlatformRole;
  status?: UserStatus;
  legacyNewApiUserId?: number | null;
}

const STUDIO_TOKEN_NAME = "studio";

function generateNewApiPassword(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Create a platform user with a default owner workspace backed by a dedicated new-api
 * account. New-api is provisioned first; the local transaction only runs once it
 * succeeds, and a local failure triggers a best-effort new-api compensation call
 * (design doc §5.1 — an orphaned new-api account on double failure is an accepted,
 * rare outcome, not something this function retries indefinitely).
 */
export async function provisionPlatformUser(
  database: PlatformDatabase,
  input: ProvisionPlatformUserInput,
): Promise<PlatformUserRecord> {
  const username = normalizeUsername(input.username);
  if (!username) throw new Error("A username is required.");
  const displayName = input.displayName?.trim() || username;

  const newApiUsername = `reizo-${username}`;
  const newApiPassword = generateNewApiPassword();

  await createNewApiUser({ username: newApiUsername, password: newApiPassword, displayName });
  const newApiUserId = await findNewApiUserIdByUsername(newApiUsername);
  if (newApiUserId === null) {
    throw new Error("new-api user was created but could not be found afterward.");
  }

  try {
    const pat = await loginAndMintPat(newApiUsername, newApiPassword);
    await createTeamToken(pat, STUDIO_TOKEN_NAME);
    const studioTokenId = await findTeamTokenIdByName(pat, STUDIO_TOKEN_NAME);
    if (studioTokenId === null) {
      throw new Error("Studio token was created but could not be found afterward.");
    }
    const studioTokenKey = await fetchTeamTokenKey(pat, studioTokenId);

    return await database.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          username,
          displayName,
          email: normalizeEmail(input.email),
          passwordHash: input.passwordHash ?? null,
          image: input.image ?? null,
          emailVerifiedAt: input.emailVerifiedAt ?? null,
          platformRole: input.platformRole ?? "user",
          status: input.status ?? "active",
          legacyNewApiUserId: input.legacyNewApiUserId ?? null,
        })
        .returning();
      if (!createdUser) throw new Error("账户创建未返回记录。");

      const [organization] = await tx
        .insert(organizations)
        .values({
          name: `${createdUser.displayName} 的工作区`,
          slug: `${username}-${createdUser.id.slice(0, 8)}`,
          createdByUserId: createdUser.id,
        })
        .returning();
      if (!organization) throw new Error("工作区创建未返回记录。");

      await tx.insert(organizationMemberships).values({
        organizationId: organization.id,
        userId: createdUser.id,
        role: "owner",
      });

      const { TeamNewApiMappingRepository } = await import("./repositories/team-new-api-mapping");
      await new TeamNewApiMappingRepository().create(tx, {
        organizationId: organization.id,
        newApiUserId,
        newApiUsername,
        newApiPasswordCiphertext: encryptSecret(newApiPassword),
        newApiPatCiphertext: encryptSecret(pat),
      });

      const studioKey = generateApiKey();
      await tx.insert(apiKeys).values({
        userId: createdUser.id,
        organizationId: organization.id,
        name: "Studio",
        keyPrefix: studioKey.prefix,
        keyHash: studioKey.hash,
        newApiTokenId: studioTokenId,
        newApiKeyCiphertext: encryptSecret(studioTokenKey),
        isStudioHidden: true,
      });

      await tx
        .update(users)
        .set({ currentOrganizationId: organization.id })
        .where(eq(users.id, createdUser.id));

      return createdUser;
    });
  } catch (error) {
    try {
      await disableNewApiUser(newApiUserId);
    } catch (compensationError) {
      console.error(
        "Failed to compensate for orphaned new-api user after local registration failure",
        { newApiUserId, newApiUsername, compensationError },
      );
    }
    throw error;
  }
}
```

This needs `eq` from `drizzle-orm` imported at the top (`import { eq } from "drizzle-orm";`)
— add it alongside the other imports.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/platform/provision.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full platform test suite for regressions**

Run: `npx vitest run src/lib/platform`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/platform/provision.ts src/lib/platform/provision.test.ts
git commit -m "feat(platform): make registration create the new-api user and studio token first"
```

---

## Task 8: Virtual API key CRUD backed by new-api

**Files:**
- Modify: `src/lib/platform/repositories/api-keys.ts`
- Modify: `src/lib/console/server.ts` (key-creation/-revocation call sites)
- Test: extend `src/lib/platform/repositories/api-keys.test.ts` (new file — none exists
  today) and add coverage in whichever `src/lib/console/*.test.ts` already covers key
  creation (check for one before assuming none exists; if none does, add
  `src/lib/console/server.test.ts` scoped to just the key-creation/-revocation functions).

**Interfaces:**
- Consumes: `TeamNewApiMappingRepository.findByOrganizationId` (Task 6), `decryptSecret`
  (Task 2), `createTeamToken`/`findTeamTokenIdByName`/`fetchTeamTokenKey`/`revokeTeamToken`
  (Task 5).
- Produces: `ApiKeyRepository.create` gains a required `organizationId` (already optional
  today — make it required for this call path, since a virtual key with no team has no
  new-api mapping to attach to) and now also creates the backing new-api token; existing
  callers that create **personal** (non-team) keys must be re-pointed at organization-scoped
  keys or explicitly rejected — resolve this by requiring `organizationId` in the input type
  and updating `src/app/api/console/keys/route.ts`'s `POST` handler (design doc §5.3/§5.4:
  only organization-scoped virtual keys exist under the new model, there is no more
  "personal API key with self-hosted billing" concept).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/platform/repositories/api-keys.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../newapi/team-client", () => ({
  createTeamToken: vi.fn(async () => {}),
  findTeamTokenIdByName: vi.fn(async () => 55),
  fetchTeamTokenKey: vi.fn(async () => "sk-newapi-raw"),
  revokeTeamToken: vi.fn(async () => {}),
}));
vi.mock("../../newapi/crypto", () => ({
  encryptSecret: vi.fn((value: string) => `enc(${value})`),
  decryptSecret: vi.fn((value: string) => value.replace(/^enc\(|\)$/g, "")),
}));

import { createTeamToken, revokeTeamToken } from "../../newapi/team-client";
import { ApiKeyRepository } from "./api-keys";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";

function fakeDatabase(insertedRow: Record<string, unknown>) {
  return {
    insert: () => ({ values: () => ({ returning: async () => [insertedRow] }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [insertedRow] }) }) }),
  } as unknown as ConstructorParameters<typeof ApiKeyRepository>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(TeamNewApiMappingRepository.prototype, "findByOrganizationId").mockResolvedValue({
    organizationId: "org-1",
    newApiUserId: 42,
    newApiUsername: "reizo-team-abc",
    newApiPasswordCiphertext: "enc(pw)",
    newApiPatCiphertext: "enc(pat)",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("ApiKeyRepository.create (new-api backed)", () => {
  it("creates a new-api token before storing the local key row", async () => {
    const database = fakeDatabase({
      id: "key-1",
      userId: "user-1",
      organizationId: "org-1",
      keyPrefix: "wl_abc123",
      keyHash: "hash",
      newApiTokenId: 55,
      newApiKeyCiphertext: "enc(sk-newapi-raw)",
    });
    const repository = new ApiKeyRepository(database);

    const result = await repository.create({ userId: "user-1", organizationId: "org-1", name: "CI key" });

    expect(createTeamToken).toHaveBeenCalledWith("pat", "CI key");
    expect(result.record.newApiTokenId).toBe(55);
    expect(result.plaintext).toMatch(/^wl_/);
  });
});

describe("ApiKeyRepository.revoke (new-api backed)", () => {
  it("best-effort revokes the underlying new-api token", async () => {
    const database = fakeDatabase({
      id: "key-1",
      status: "revoked",
      newApiTokenId: 55,
      organizationId: "org-1",
    });
    const repository = new ApiKeyRepository(database);
    await repository.revoke("key-1");
    expect(revokeTeamToken).toHaveBeenCalledWith("pat", 55);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/platform/repositories/api-keys.test.ts`
Expected: FAIL — current `create`/`revoke` never call `createTeamToken`/`revokeTeamToken`.

- [ ] **Step 3: Update the implementation**

Rewrite `src/lib/platform/repositories/api-keys.ts`:

```typescript
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { apiKeys } from "../db/schema";
import { generateApiKey, hashApiKey } from "../api-keys";
import { decryptSecret, encryptSecret } from "../../newapi/crypto";
import { createTeamToken, fetchTeamTokenKey, findTeamTokenIdByName, revokeTeamToken } from "../../newapi/team-client";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";
import type { ApiKeyStatus } from "../types";

export type ApiKeyRecord = InferSelectModel<typeof apiKeys>;

export interface CreateApiKeyInput {
  userId: string;
  organizationId: string;
  name: string;
  scopes?: string[];
  allowedModels?: string[];
  allowedGroups?: string[];
  ipAllowlist?: string[];
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export class ApiKeyRepository {
  private readonly teamMappings = new TeamNewApiMappingRepository(this.database);

  constructor(private readonly database: PlatformDatabase) {}

  async create(input: CreateApiKeyInput): Promise<{ record: ApiKeyRecord; plaintext: string }> {
    const name = input.name.trim();
    if (!name) throw new Error("An API key name is required.");

    const mapping = await this.teamMappings.findByOrganizationId(input.organizationId);
    if (!mapping) throw new Error("This organization has no linked new-api team account.");
    const pat = decryptSecret(mapping.newApiPatCiphertext);

    await createTeamToken(pat, name);
    const newApiTokenId = await findTeamTokenIdByName(pat, name);
    if (newApiTokenId === null) throw new Error("new-api token was created but could not be found afterward.");
    const newApiKey = await fetchTeamTokenKey(pat, newApiTokenId);

    const generated = generateApiKey();
    const [record] = await this.database
      .insert(apiKeys)
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        scopes: input.scopes ?? [],
        allowedModels: input.allowedModels ?? [],
        allowedGroups: input.allowedGroups ?? [],
        ipAllowlist: input.ipAllowlist ?? [],
        newApiTokenId,
        newApiKeyCiphertext: encryptSecret(newApiKey),
        expiresAt: input.expiresAt ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!record) throw new Error("Failed to create API key.");
    return { record, plaintext: generated.plaintext };
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    const [record] = await this.database.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return record ?? null;
  }

  async findActiveByPlaintext(plaintext: string): Promise<ApiKeyRecord | null> {
    const keyHash = hashApiKey(plaintext);
    const [record] = await this.database
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.status, "active"),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
        ),
      )
      .limit(1);
    if (!record) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
    return record;
  }

  async listForUser(userId: string, organizationId?: string): Promise<ApiKeyRecord[]> {
    const conditions = [eq(apiKeys.userId, userId)];
    if (organizationId) conditions.push(eq(apiKeys.organizationId, organizationId));
    return this.database.select().from(apiKeys).where(and(...conditions));
  }

  async listForOrganization(organizationId: string): Promise<ApiKeyRecord[]> {
    return this.database.select().from(apiKeys).where(eq(apiKeys.organizationId, organizationId));
  }

  async setStatus(id: string, status: ApiKeyStatus): Promise<ApiKeyRecord | null> {
    const [record] = await this.database
      .update(apiKeys)
      .set({ status, revokedAt: status === "revoked" ? new Date() : undefined, updatedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return record ?? null;
  }

  /** Marks the key revoked locally, then best-effort revokes the new-api token behind it —
   * a revoked local key stops working at the proxy regardless of new-api-side state, so a
   * failure here is logged, not thrown (design doc §5.3). */
  async revoke(id: string): Promise<ApiKeyRecord | null> {
    const record = await this.setStatus(id, "revoked");
    if (record?.newApiTokenId && record.organizationId) {
      const mapping = await this.teamMappings.findByOrganizationId(record.organizationId);
      if (mapping) {
        try {
          await revokeTeamToken(decryptSecret(mapping.newApiPatCiphertext), record.newApiTokenId);
        } catch (error) {
          console.error("Failed to revoke underlying new-api token", { keyId: id, error });
        }
      }
    }
    return record;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.database.update(apiKeys).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, id));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/platform/repositories/api-keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the console key-creation route for the now-required `organizationId`**

Open `src/app/api/console/keys/route.ts`. Its `POST` handler currently allows
`input.organizationId` to be absent (personal key). Change it to require an
organization — read the current implementation of `parseConsoleKeyInput` in
`src/lib/console/server.ts` first (grep for its definition) to see whether
`organizationId` is already validated as optional-string; adjust the validation there to
require a non-empty `organizationId`, and update the route handler:

```typescript
export async function POST(request: Request) {
  try {
    const context = await requireConsoleContext();
    const input = parseConsoleKeyInput(await request.json());
    if (!input.organizationId) {
      return consoleError(new Error("organizationId is required to create an API key."));
    }
    const selected = await requireConsoleOrganization(context, input.organizationId);
    ensureOrganizationKeyManager(selected.membership.role);
    const { record, plaintext } = await context.repositories.apiKeys.create({
      userId: context.userId,
      organizationId: input.organizationId,
      name: input.name,
      expiresAt: input.expiresAt,
      allowedModels: input.allowedModels,
      ipAllowlist: input.ipAllowlist,
    });
    return consoleJson({ key: mapConsoleApiKey(record), secret: plaintext }, { status: 201 });
  } catch (error) {
    return consoleError(error);
  }
}
```

(`quotaLimitMicrocredits` is removed from the call since Task 3 dropped that column.)
Adjust `consoleError`'s expected error shape if it needs a specific error type rather than
a plain `Error` — check its current implementation and match its existing pattern rather
than introducing a new error class here.

- [ ] **Step 6: Run the console test suite**

Run: `npx vitest run src/lib/console src/app/api/console`
Expected: PASS, or update any test that asserted the old "personal key, no org" path —
that path no longer exists by design.

- [ ] **Step 7: Commit**

```bash
git add src/lib/platform/repositories/api-keys.ts src/lib/platform/repositories/api-keys.test.ts \
        src/app/api/console/keys/route.ts src/lib/console/server.ts
git commit -m "feat(platform): back virtual API keys with new-api tokens end to end"
```

---

## Task 9: `/v1/*` proxy route

**Files:**
- Create: `src/app/api/v1/[...path]/route.ts`
- Test: `src/app/api/v1/[...path]/route.test.ts`

**Interfaces:**
- Consumes: `ApiKeyRepository.findActiveByPlaintext` (Task 8, unchanged signature),
  `decryptSecret` (Task 2).
- Produces: a catch-all Route Handler exporting `GET`, `POST`, `PUT`, `DELETE`, `PATCH` that
  all delegate to one internal `proxyRequest` function — this is what Studio (Task 11) can
  either call internally or hit over loopback HTTP; keep `proxyRequest` exported so Task 11
  can import it directly and skip the network hop.

Implements design doc §6: extract Bearer key → sha256 lookup → decrypt → forward → stream
back, with `last_used_at` touched fire-and-forget.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/v1/[...path]/route.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({
  getPlatformRepositories: vi.fn(() => ({
    apiKeys: {
      findActiveByPlaintext: vi.fn(async (plaintext: string) =>
        plaintext === "wl_valid"
          ? { id: "key-1", newApiKeyCiphertext: "enc(sk-real)", status: "active" }
          : null,
      ),
      touchLastUsed: vi.fn(async () => {}),
    },
  })),
}));
vi.mock("@/lib/newapi/crypto", () => ({
  decryptSecret: vi.fn((value: string) => value.replace(/^enc\(|\)$/g, "")),
}));

import { POST } from "./route";

describe("POST /api/v1/[...path]", () => {
  it("rejects requests with no bearer key", async () => {
    const request = new Request("https://reizo.example/api/v1/chat/completions", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ path: ["chat", "completions"] }) });
    expect(response.status).toBe(401);
  });

  it("rejects an unknown key", async () => {
    const request = new Request("https://reizo.example/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer wl_unknown" },
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["chat", "completions"] }) });
    expect(response.status).toBe(401);
  });

  it("forwards a valid request to new-api with the decrypted key", async () => {
    process.env.NEW_API_URL = "https://v2api.top";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://reizo.example/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer wl_valid", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages: [] }),
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["chat", "completions"] }) });

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-real");

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/v1/[...path]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/v1/[...path]/route.ts
import { NextResponse } from "next/server";
import { getPlatformRepositories } from "@/lib/platform";
import { decryptSecret } from "@/lib/newapi/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerKey(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function newApiBaseUrl(): string {
  const configured = process.env.NEW_API_URL?.trim();
  if (!configured) throw new Error("NEW_API_URL is not configured.");
  return configured.replace(/\/+$/, "");
}

export async function proxyRequest(request: Request, path: string[]): Promise<Response> {
  const plaintext = bearerKey(request);
  if (!plaintext) {
    return NextResponse.json({ error: { message: "Missing bearer API key" } }, { status: 401 });
  }

  const repositories = getPlatformRepositories();
  if (!repositories) {
    return NextResponse.json({ error: { message: "Platform database is not configured" } }, { status: 503 });
  }

  const record = await repositories.apiKeys.findActiveByPlaintext(plaintext);
  if (!record || !record.newApiKeyCiphertext) {
    return NextResponse.json({ error: { message: "Invalid API key" } }, { status: 401 });
  }

  const newApiKey = decryptSecret(record.newApiKeyCiphertext);
  const targetUrl = `${newApiBaseUrl()}/v1/${path.join("/")}`;

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("Authorization", `Bearer ${newApiKey}`);
  forwardHeaders.delete("host");

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: forwardHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // @ts-expect-error -- required by undici when streaming a Request body through fetch
    duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
    cache: "no-store",
  });

  void repositories.apiKeys.touchLastUsed(record.id).catch((error) => {
    console.error("Failed to update api_keys.last_used_at", { keyId: record.id, error });
  });

  return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/v1/[...path]/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Manual streaming smoke test**

This route cannot be fully verified by unit tests alone (design doc §10 risk 3 — SSE
passthrough correctness). After deploying to a preview/dev environment with a real
`NEW_API_URL` and a real virtual key minted via Task 8's flow, run:

```bash
curl -N https://<reizo-dev-host>/api/v1/chat/completions \
  -H "Authorization: Bearer <virtual-sk->" \
  -H "Content-Type: application/json" \
  -d '{"model":"<a real model on this new-api>","messages":[{"role":"user","content":"say hi"}],"stream":true}'
```

Expected: tokens arrive incrementally as `data: {...}` lines, not all at once at the end
(which would indicate buffering). Record the result in the PR description for Task 9;
do not mark this task done until this manual check has actually been run once.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/v1/[...path]/route.ts" "src/app/api/v1/[...path]/route.test.ts"
git commit -m "feat(proxy): add /v1/* route forwarding virtual keys to new-api"
```

---

## Task 10: Repoint Studio to new-api via the hidden team token

**Files:**
- Modify: `src/lib/agent/provider/gateway.ts`
- Modify: `src/lib/agent/provider/gateway.test.ts` (existing file — extend, don't replace)
- Create: `src/lib/agent/provider/studio-token.ts`
- Test: `src/lib/agent/provider/studio-token.test.ts`

**Interfaces:**
- Consumes: `getPlatformRepositories` (org lookup), `decryptSecret` (Task 2).
- Produces: `resolveStudioToken(userId: string): Promise<string>` — looks up the user's
  `currentOrganizationId`, finds that organization's `is_studio_hidden` api_keys row,
  decrypts `new_api_key_ciphertext`, returns the plaintext new-api `sk-`. `streamGatewayChat`
  and `generateImage` in `gateway.ts` already accept a `token` override parameter
  (`StreamGatewayChatParams.token`, `GenerateImageParams.token` — confirmed present) and
  already resolve `getGatewayBaseUrl()` from `REIZO_GATEWAY_URL`/`NEW_API_URL` env vars — no
  change needed to their HTTP mechanics, only to what token and base URL callers pass in.

This task is smaller than it looks: `gateway.ts`'s `streamGatewayChat`/`generateImage`
already speak plain OpenAI-compatible HTTP against any base URL with any bearer token — they
were never gateway-protocol-specific. The only real work is (a) a resolver that looks up the
right per-team new-api token, and (b) pointing the base URL at `NEW_API_URL` instead of the
gateway's `127.0.0.1:4010` default in non-legacy mode.

- [ ] **Step 1: Write the failing test for the resolver**

```typescript
// src/lib/agent/provider/studio-token.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({
  getPlatformRepositories: vi.fn(() => ({
    users: { findById: vi.fn(async () => ({ id: "user-1", currentOrganizationId: "org-1" })) },
    apiKeys: {
      listForOrganization: vi.fn(async () => [
        { id: "key-1", isStudioHidden: false, newApiKeyCiphertext: "enc(other)" },
        { id: "key-2", isStudioHidden: true, newApiKeyCiphertext: "enc(sk-studio-real)" },
      ]),
    },
  })),
}));
vi.mock("@/lib/newapi/crypto", () => ({
  decryptSecret: vi.fn((value: string) => value.replace(/^enc\(|\)$/g, "")),
}));

import { resolveStudioToken } from "./studio-token";

describe("resolveStudioToken", () => {
  it("returns the decrypted studio-hidden key for the user's current organization", async () => {
    await expect(resolveStudioToken("user-1")).resolves.toBe("sk-studio-real");
  });

  it("throws when the user has no current organization", async () => {
    const { getPlatformRepositories } = await import("@/lib/platform");
    vi.mocked(getPlatformRepositories).mockReturnValueOnce({
      users: { findById: vi.fn(async () => ({ id: "user-2", currentOrganizationId: null })) },
      apiKeys: { listForOrganization: vi.fn() },
    } as never);
    await expect(resolveStudioToken("user-2")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/agent/provider/studio-token.test.ts`
Expected: FAIL — `Cannot find module './studio-token'`.

- [ ] **Step 3: Write the resolver**

```typescript
// src/lib/agent/provider/studio-token.ts
import { getPlatformRepositories } from "@/lib/platform";
import { decryptSecret } from "@/lib/newapi/crypto";

export async function resolveStudioToken(userId: string): Promise<string> {
  const repositories = getPlatformRepositories();
  if (!repositories) throw new Error("Platform database is not configured.");

  const user = await repositories.users.findById(userId);
  if (!user?.currentOrganizationId) {
    throw new Error(`User ${userId} has no current organization to resolve a Studio token for.`);
  }

  const keys = await repositories.apiKeys.listForOrganization(user.currentOrganizationId);
  const studioKey = keys.find((key) => key.isStudioHidden);
  if (!studioKey?.newApiKeyCiphertext) {
    throw new Error(`Organization ${user.currentOrganizationId} has no Studio token provisioned.`);
  }
  return decryptSecret(studioKey.newApiKeyCiphertext);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/agent/provider/studio-token.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Point `getGatewayBaseUrl` at new-api by default and add a regression test**

In `src/lib/agent/provider/gateway.ts`, `getGatewayBaseUrl` (currently lines 57-61)
currently only falls back to `NEW_API_URL` when `REIZO_AUTH_MODE=legacy`. Since new-api is
now the target in **all** modes (the "legacy"/"reizo" distinction was about local-user-vs-
proxied auth, not about which LLM backend to call — design doc §1), change the default
fallback chain:

```typescript
export function getGatewayBaseUrl(override?: string): string {
  const raw = override ?? process.env.REIZO_GATEWAY_URL ?? process.env.NEW_API_URL ?? DEFAULT_BASE;
  return raw.replace(/\/+$/, "");
}
```

Add a test alongside the existing ones in `gateway.test.ts` (open the file first to match
its existing `describe`/`it` structure and any shared env-var save/restore helpers already
present, then add):

```typescript
describe("getGatewayBaseUrl", () => {
  it("falls back to NEW_API_URL when REIZO_GATEWAY_URL is unset", () => {
    delete process.env.REIZO_GATEWAY_URL;
    process.env.NEW_API_URL = "https://v2api.top";
    expect(getGatewayBaseUrl()).toBe("https://v2api.top");
  });
});
```

(Import `getGatewayBaseUrl` in the test file if not already imported.)

- [ ] **Step 6: Wire the resolver into Studio's call sites**

Find where `streamGatewayChat`/`generateImage` are actually invoked for Studio requests
(grep `streamGatewayChat(` and `generateImage(` outside of `gateway.ts`/`gateway.test.ts`
itself — likely under `src/app/api/studio/**` or `src/lib/studio/**`). At each call site,
replace whatever currently supplies `token` (today: `REIZO_SERVICE_KEY` via the parameter
default, or an explicit pass-through) with `await resolveStudioToken(userId)`, using
whatever `userId` variable is already in scope at that call site from the existing auth
context. Do not change any other parameter.

- [ ] **Step 7: Run the full agent/provider and studio test suites**

Run: `npx vitest run src/lib/agent/provider src/lib/studio src/app/api/studio`
Expected: PASS, or update any test mocking the old `REIZO_SERVICE_KEY`-based token flow to
mock `resolveStudioToken` instead.

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/provider/gateway.ts src/lib/agent/provider/gateway.test.ts \
        src/lib/agent/provider/studio-token.ts src/lib/agent/provider/studio-token.test.ts
git commit -m "feat(studio): resolve LLM calls through the team's hidden new-api token"
```

---

## Task 11: Team usage/balance observability

**Files:**
- Modify: `src/app/api/account/[action]/route.ts` (`GET /api/account/self` currently reads
  `repositories.wallets`/`usageEvents`, both removed in Task 3)
- Create: `src/app/api/console/usage/route.ts` (per-key + Studio usage breakdown for team
  admins — check first whether `src/app/api/console/usage/route.ts` or similarly-named file
  already exists per the earlier recon note that `src/app/api/console/{wallet,usage,...}`
  exist; if so, modify that file instead of creating a new one)
- Test: matching `route.test.ts` files, following whatever test convention the existing
  `src/app/api/console/**` routes already use (check for one before writing from scratch)

**Interfaces:**
- Consumes: `getNewApiUserQuota` (Task 4), `getTokenUsage` (Task 5), `decryptSecret`
  (Task 2), `TeamNewApiMappingRepository.findByOrganizationId` (Task 6).

Implements design doc §7. `GET /api/account/self`'s current body (lines 111-138 of
`route.ts`) computes `balance`/`used_quota`/`request_count` from `repositories.wallets` and
raw `usageEvents` SQL — both gone after Task 3. Replace with a call through the new-api
adapter using the caller's current organization's mapping.

- [ ] **Step 1: Write the failing test**

```typescript
// add to a new or existing src/app/api/account/[action]/route.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({
  getCurrentAuthContext: vi.fn(async () => ({ userId: "user-1", username: "team-abc", displayName: "Team ABC", email: null })),
  getPlatformRepositories: vi.fn(() => ({
    users: { findById: vi.fn(async () => ({ id: "user-1", currentOrganizationId: "org-1" })) },
    teamNewApiMapping: { findByOrganizationId: vi.fn(async () => ({ newApiUserId: 42 })) },
  })),
  getPlatformDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/newapi/admin-client", () => ({
  getNewApiUserQuota: vi.fn(async (id: number) => (id === 42 ? { quota: 1000, usedQuota: 250 } : null)),
}));
vi.mock("@/lib/platform/auth", () => ({ getAuthMode: vi.fn(() => "reizo") }));

import { GET } from "./route";

describe("GET /api/account/self", () => {
  it("returns quota/used_quota sourced from new-api", async () => {
    const request = new Request("https://reizo.example/api/account/self");
    const response = await GET(request as never, { params: Promise.resolve({ action: "self" }) });
    const body = await response.json();
    expect(body.data.quota).toBe(1000);
    expect(body.data.used_quota).toBe(250);
  });
});
```

(Adjust the mock shape to match whatever `getCurrentAuthContext` actually returns — read
`src/lib/auth/session.ts` before finalizing this test if the fields above don't match.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/account/[action]/route.test.ts"`
Expected: FAIL — current handler still queries `wallets`/`usageEvents`, which Task 3 removed
from the schema (this will actually be a compile/import error at this point, confirming the
old code path is dead and must be replaced, not merely tested around).

- [ ] **Step 3: Rewrite the `GET /api/account/self` handler**

Replace lines 99-139 of `src/app/api/account/[action]/route.ts` (the non-legacy branch of
`GET`) with:

```typescript
  const repositories = getPlatformRepositories();
  const database = getPlatformDb();
  if (!repositories || !database) {
    return NextResponse.json({ success: false, message: "平台数据库尚未配置。" }, { status: 503 });
  }
  const platformUser = await repositories.users.findById(user.userId);
  if (!platformUser?.currentOrganizationId) {
    return NextResponse.json({ success: false, message: "账户尚未关联工作区。" }, { status: 409 });
  }
  const mapping = await repositories.teamNewApiMapping.findByOrganizationId(platformUser.currentOrganizationId);
  if (!mapping) {
    return NextResponse.json({ success: false, message: "工作区未关联额度账户。" }, { status: 409 });
  }
  const { getNewApiUserQuota } = await import("@/lib/newapi/admin-client");
  const { quota, usedQuota } = await getNewApiUserQuota(mapping.newApiUserId);

  return NextResponse.json({
    success: true,
    data: {
      id: user.userId,
      username: user.username,
      display_name: user.displayName,
      email: user.email ?? "",
      quota,
      used_quota: usedQuota,
      group: "personal",
    },
  }, { headers: { "cache-control": "no-store" } });
```

Remove the now-unused `usageEvents` import and the `and`/`eq`/`sql` drizzle imports if
nothing else in the file uses them (check before deleting — `and`/`eq` may still be used
elsewhere in the file).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/account/[action]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Add per-key usage to the console usage route**

Open the existing `src/app/api/console/usage/route.ts` (per the earlier recon, this path
already exists under `src/app/api/console/{wallet,usage,...}`). Read its current
implementation fully before editing — it currently sources data from `usageEvents`/wallet
tables Task 3 removed, so this is a required rewrite, not an addition. Replace its data
source with: for each `apiKeys` row in the caller's current organization
(`repositories.apiKeys.listForOrganization`), decrypt `new_api_key_ciphertext` and call
`getTokenUsage` (Task 5), tagging the `is_studio_hidden` row's result as `"studio"` and
every other row as `"key"` in the response, per design doc §7's requirement that Studio
usage be shown as a distinct line item rather than summed into "keys". Add a short-TTL
in-memory cache (a module-level `Map<string, {expiresAt: number; value: TokenUsage}>`
keyed by `newApiTokenId`, ~30s TTL) around the `getTokenUsage` calls per design doc §7's
explicit caution against N synchronous calls per page load — write this cache as a small
named helper (e.g. `cachedTokenUsage(tokenId, fetcher)`) so its test can assert the second
call within the TTL window doesn't hit `fetch` again.

- [ ] **Step 6: Run the console usage test suite**

Run: `npx vitest run src/app/api/console/usage`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/account/[action]/route.ts" "src/app/api/account/[action]/route.test.ts" \
        src/app/api/console/usage
git commit -m "feat(observability): source account/team usage from new-api instead of the wallet engine"
```

---

## Task 12: Decommission the Go gateway and old billing surface

**Files:**
- Modify: `src/lib/studio/capabilities.server.ts`, `src/app/api/catalog/plaza/route.ts`
  (repoint away from gateway-specific env/behavior — read each file's current gateway
  usage first; most likely these just need their base-URL resolution to match Task 10's
  `getGatewayBaseUrl` change, since `ai-sdk.test.ts`/`gateway.test.ts` already cover the
  shared logic)
- Delete: `src/app/gateway-admin/**`, `src/app/api/gateway-admin/**`,
  `src/lib/gateway-admin/server.ts`, `scripts/migrate-new-api.ts`,
  `docs/MIGRATE_NEW_API.md`, `src/lib/migration-new-api.test.ts`
- Modify: `package.json` (remove `gateway:*`, `test:gateway`, `migration:new-api*` scripts)
- Do not yet delete: `services/gateway/**` itself — leave the Go source in place until
  Task 13 confirms the production systemd service is stopped; deleting the directory
  before that is a one-way loss of rollback-relevant code with no benefit before cutover.

- [ ] **Step 1: Confirm nothing else imports the files being deleted**

```bash
grep -rl "gateway-admin" src --include="*.ts" --include="*.tsx"
grep -rl "migrate-new-api\|migration-new-api" src scripts --include="*.ts"
```

Expected after Tasks 1-11: only the files listed above under "Delete". If anything else
matches, read it and decide whether it's dead code to delete too or a real dependency that
changes this task's scope — do not delete blindly.

- [ ] **Step 2: Remove the gateway-admin surface and old migration script**

```bash
git rm -r src/app/gateway-admin src/app/api/gateway-admin src/lib/gateway-admin \
  scripts/migrate-new-api.ts docs/MIGRATE_NEW_API.md src/lib/migration-new-api.test.ts
```

- [ ] **Step 3: Clean up `package.json`**

Remove the `gateway:dev`, `gateway:build`, `gateway:pricing-import`, `test:gateway`,
`migration:new-api`, `migration:new-api:dry-run` script entries. Leave `media-worker:*`
and everything else untouched — they're unrelated to this integration.

- [ ] **Step 4: Repoint the two remaining gateway-referencing files**

Read `src/lib/studio/capabilities.server.ts` and `src/app/api/catalog/plaza/route.ts` in
full. For each, confirm whether they call `getGatewayBaseUrl`/`streamGatewayChat` (already
fixed by Task 10) or read `process.env.REIZO_GATEWAY_*` directly. If the latter, replace
with the same `NEW_API_URL`-first resolution Task 10 established — do not invent a third
resolution scheme.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. This is the first full-suite run since Task 3's schema changes — treat any
failure outside the files this plan touched as a signal that something else in the
codebase depended on the dropped tables/gateway surface and was missed; investigate rather
than skip.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Go gateway admin surface and obsolete new-api migration script"
```

---

## Task 13: Production cutover (operational, not code)

Run only after Tasks 1-12 are merged, reviewed, and the local test suite is fully green.
This task executes the deployment order from design doc §9. Use the
`connect-reizo-server` skill for `176.122.164.148` connection details and the
`connect-new-api-server-15-204-82-213` skill for `15.204.82.213`.

- [ ] **Step 1: Back up the Reizo production database**

```bash
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' -o BatchMode=yes -o ConnectTimeout=20 \
  root@176.122.164.148 \
  'cd /opt/reizo && set -a && . ./.env; set +a && pg_dump "$DATABASE_URL" -Fc -f /root/reizo-pre-newapi-cutover-$(date +%Y%m%d%H%M%S).dump'
```

Expected: exits 0, dump file present via a follow-up `ls -la /root/*.dump`.

- [ ] **Step 2: Populate new env vars**

Add to `/opt/reizo/.env` on `176.122.164.148` (values from Task 1 and the existing
`REIZO_TOKEN_ENCRYPTION_KEY` generation convention — generate a fresh 32-byte key with
`openssl rand -hex 32` if one doesn't already exist for this purpose):

```
NEW_API_URL=https://v2api.top
NEW_API_ADMIN_TOKEN=<PAT from Task 1, Step 2>
REIZO_TOKEN_ENCRYPTION_KEY=<32-byte hex, from openssl rand -hex 32>
```

Do not remove `REIZO_GATEWAY_*` variables yet — Step 5 does that only after the new path
is confirmed working, so a fast rollback (Step 6) doesn't need to re-add them.

- [ ] **Step 3: Deploy via the existing workflow**

Follow `.github/workflows/deploy.yml` per the `connect-reizo-server` skill — it applies
`node scripts/db-migrate.mjs` (which will run Task 3's destructive migration) before
restarting `reizo.service`. Confirm the migration step's logs show the new
`team_new_api_mapping` table and `api_keys` column changes applying, and the `DROP TABLE`
statements for the billing tables succeeding.

- [ ] **Step 4: Verify health and one real registration + key + chat round trip**

```bash
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' -o BatchMode=yes -o ConnectTimeout=20 \
  root@176.122.164.148 \
  'systemctl is-active reizo.service; curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/studio'
```

Expected: `active` and `200`. Then, from a browser or `curl` against the public
`https://winlume.v2api.top`, register a throwaway test account, confirm the account page
shows a nonzero-capable quota (even if `0`, confirm it's sourced from new-api and not an
error), create a virtual key via the console UI, and run the Task 9 Step 5 streaming smoke
test against it through the real production proxy.

- [ ] **Step 5: Stop the old gateway service and remove `REIZO_GATEWAY_*` env vars**

```bash
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' -o BatchMode=yes -o ConnectTimeout=20 \
  root@176.122.164.148 'systemctl list-units | grep -i gateway'
```

Confirm the actual unit name (design doc §9 flags this as unverified — do not assume
`reizo-gateway.service`), then:

```bash
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' -o BatchMode=yes -o ConnectTimeout=20 \
  root@176.122.164.148 'systemctl stop <confirmed-unit-name> && systemctl disable <confirmed-unit-name>'
```

Remove `REIZO_GATEWAY_*` lines from `/opt/reizo/.env` only after Step 4's verification has
been running cleanly for a reasonable soak period (operator judgment — at minimum, past
one full deploy cycle with no gateway-dependent errors in `journalctl -u reizo`).

- [ ] **Step 6: Rollback plan if Step 4 fails**

Restore `/opt/reizo.previous` per the `connect-reizo-server` skill's standard rollback
procedure, restore the database from Step 1's dump if the schema migration already ran:

```bash
ssh -i 'C:\Users\XXB\.ssh\winlume-176-deploy' -o BatchMode=yes -o ConnectTimeout=20 \
  root@176.122.164.148 'cd /opt/reizo && set -a && . ./.env; set +a && pg_restore -d "$DATABASE_URL" --clean --if-exists /root/reizo-pre-newapi-cutover-*.dump'
```

then re-verify the two health endpoints from the `connect-reizo-server` skill's "Inspect
And Verify" section before considering the rollback complete.

- [ ] **Step 7: Delete the gateway source once decommission is confirmed stable**

Only after Step 5's soak period, in a follow-up commit (not part of this deploy):

```bash
git rm -r services/gateway
git commit -m "chore: remove decommissioned Go gateway source"
```

---

## Self-Review Notes

- **Spec coverage:** §2 goals → Tasks 3/6/7/8/9/10; §3 data model → Task 3; §4 adapter →
  Tasks 4/5; §5 registration/keys → Tasks 6/7/8; §6 proxy → Task 9; §7 observability →
  Task 11; §8 env vars → Tasks 1/13; §9 decommission → Tasks 12/13; §10 risks → called out
  inline in Tasks 1, 2, 3, 8, 9, 13 at the point each risk becomes concrete.
- **Placeholder scan:** no TBD/TODO left; the one item flagged as not verified against
  literal source (`GET /api/user/search`'s response envelope key, Task 4) is explicitly
  named as a targeted follow-up rather than silently assumed.
- **Type consistency:** `CreateApiKeyInput.organizationId` is `string` (required) from
  Task 8 onward — Task 7's Studio key insert and Task 9's proxy both key off the same
  `apiKeys.newApiKeyCiphertext`/`newApiTokenId`/`isStudioHidden` column names introduced in
  Task 3, with no renames across tasks.
- **Scope:** intentionally excludes payment integration, per-member hard quotas, and
  multi-workspace switcher UI — all explicit non-goals in the design doc §2.
