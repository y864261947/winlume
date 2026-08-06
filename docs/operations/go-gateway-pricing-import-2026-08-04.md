# Go Gateway Pricing Import — Verification Record

Retroactive record for Task 21 (production pricing dry-run and inactive-draft
apply). Sanitized: no DSNs, tokens, channel URLs, or request content below.

## Dry-run (2026-08-05, ~08:36 UTC)

Read-only against `new-api-15-204-82-213`'s source database. No writes to
WinLume.

```
rules=382 groups=18 availability=167 disabled=7
algorithm=newapi-billing-v1
hash=555dfa0d8c60a0404fa93f02fb5e0bbcb36efffa596d8e6a8c106c71e8c13b03
```

## Apply, inactive draft (2026-08-05, 08:36:40 UTC)

`pricing-import --apply --activate=false`. Wrote one `draft` catalog to
WinLume's production `pricing_catalog_versions`. No active-row change.

```
catalog id: 4b6ccd61-7c78-4914-9830-63a6716f5e87
rules=382 groups=18 availability=167 disabled=7
hash=bc61499d7736b7b67bdad876fbcab1d0e84c34f558448e78f9b95a09748ed3e5
```

Verified directly against the target database: exactly one row, `state=draft`,
counts match the CLI report. `winlume.service` confirmed healthy
(`/studio`, `/api/skills` both 200) after the migration this apply depended on
(see below).

## Prerequisite: schema migration 0003

Applying required `drizzle/0003_go_gateway_billing.sql` on production first —
it hadn't been deployed. Found and fixed two real bugs in this step, not
specific to the import itself:

1. The migration file was missing its closing `COMMIT` (opens a `BEGIN` after
   an `ALTER TYPE ... ADD VALUE` that must run outside a transaction, per
   Postgres's own requirement, but never closed it). Every apply attempt
   executed every statement successfully and then silently rolled back on
   disconnect, with no error. Fixed in commit `5361f82c`.
2. New tables landed owned by `postgres` instead of the app's `winlume` role
   (an artifact of applying via `sudo -u postgres`). Ownership transferred to
   `winlume` for all 11 new tables before continuing.

A `pg_dump` backup was taken before the migration
(`/tmp/winlume-pre-0003-<timestamp>.dump` on the production host).

## Follow-up apply, activation (2026-08-05, ~17:02 UTC, Task 23 Step 1)

Source data on new-api drifted slightly between the original dry-run and
activation (a live system, expected):

```
rules=382 groups=18 availability=166 disabled=14
hash=c31bde941458ad242521a7d84fe7ca26acee50aec87c6b5bfd2ed0f4d25f16eb
```

Since the hash differed from the reviewed `bc61499d...` draft, the importer
correctly treated this as a new catalog rather than a no-op, inserted it, and
activated it in one transaction (`--apply --activate=true`). Verified
directly: exactly one `active` row (`c4966c6e-7b03-4b1d-aad7-c24b673c3ad6`),
the original `bc61499d...` draft remains untouched (`state=draft`) as a
rollback reference.

## Also found during import development

The importer's `buildRule()` never set `EnabledGroups`/`ProtocolFamilies`,
leaving them `nil`. Postgres encodes a nil Go slice as `NULL`, which violated
the `NOT NULL` array-column constraint on every rule insert. Fixed in commit
`5ed105d7` (defaults both to empty slices, matching the schema's own
`ARRAY[]::text[]` default intent).
