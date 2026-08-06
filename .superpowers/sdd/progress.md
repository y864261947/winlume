# SDD Progress Ledger

Branch: master
Plan: docs/superpowers/plans/2026-07-24-winlume-studio.md
Base before Task 1: f09e3f668f90f1274d3352c794115be82dc4f7fe


Task 1: complete (commits f09e3f6..94f4ee1, review clean)
Task 2: complete (shell layout + `/` → `/studio`; see task-2-report.md)
Task 2: complete (commits 94f4ee1..4f2f6c6, review clean — controller+report build pass)
Task 3: complete (8bd8dca, sessions API)
Task 4: complete (5bb35f2, gateway stream, 11 tests)
Task 5: complete (streaming chat API + session UI; see task-5-report.md)
Task 5: complete (3a385b2, chat API+UI, build pass)
Task 6: complete (skill registry + agency-agents import, 24 skills; see task-6-report.md)
Task 6: complete (0b947b3, 24 skills, 23 tests)
Task 7: complete (69a94d6, skill inject, 32 tests)
Task 8: complete (tool loop + artifacts API, 44 tests, build pass)
Task 9: complete (bea4f1e, artifact panel+preview)
Task 10: complete (auth gate, settings default model, mock experience cleanup)

---

# SDD Progress Ledger (go-gateway-billing)

Branch: codex/go-gateway-billing
Plan: docs/superpowers/plans/2026-08-04-go-gateway-billing.md
Base before Task 17: 19dbf7b7 (Task 15/16 authoritative reservation, committed after manual review; storage/billing.go integration tests deferred - no local Postgres/Docker)

Task 15/16: complete (commit 19dbf7b7, code reviewed manually, DB integration tests deferred pending Postgres access)
Task 17: complete (commit 9c857969, review clean - spec compliant, no Critical/Important findings; main.go wiring for recovery worker deferred to Task 19, DB integration tests written but unrun pending Postgres)
Task 18: complete (commits 9c857969..493dfc2f, review found Important gap - real HTTP status not persisted - fixed in 493dfc2f, re-review verified; minor doc-comment nit left, not blocking. Wiring gap: main.go still calls Client.Do not the new Client.Relay - deferred to Task 19 wiring pass)
Task 19: complete (commits b4cc51ce..HEAD, metrics/redacted-logs/startup-gates plus both deferred wiring gaps - recovery worker now started in authoritative mode, handlePublicRequest now calls the retrying relay.Client.Relay and records attempts via AttemptRecorder; see task-19-report.md. DB-dependent paths (table-presence query, live authoritative Reserve/Settle) untested pending Postgres access)
Task 19: complete (commits 493dfc2f..20d77844, includes Task 17/18 main.go wiring gaps; review found 2 Important findings - defer-order shutdown race, misleading settle metric label - both fixed in 20d77844, re-review verified clean. Known follow-up: refund event metric also always records "success" regardless of real Fail() result - not fixed, flagged for later)
Task 21: complete (production pricing dry-run + inactive-draft apply against WinLume prod DB + new-api 15.204.82.213). Found and fixed two real bugs surfaced only by running against live infra for the first time: (1) drizzle/0003_go_gateway_billing.sql was missing a trailing COMMIT, silently rolling back every apply attempt with no error - fixed in 5361f82c and applied to prod (also fixed table ownership postgres->winlume, migration tracking row inserted manually with git-blob LF hash); (2) importer's buildRule() never set EnabledGroups/ProtocolFamilies, nil slices violated NOT NULL array columns - fixed in 5ed105d7. Final result: 1 draft catalog on prod (id 4b6ccd61-7c78-4914-9830-63a6716f5e87, hash bc61499d..., 382 rules/18 groups/167 availability/7 disabled), state=draft not active, winlume.service confirmed healthy after. Pre-migration pg_dump backup left at /tmp/winlume-pre-0003-20260805162435.dump on 176.122.164.148.
Task 20: complete (commit e2735a3b, review clean - compose.test.yml + PowerShell driver + gateway.yml CI, teardown logic verified safe/scoped, end-to-end run unverified - Docker unavailable). CRITICAL GAP surfaced: storage/billing.go (Reserve/Settle/Reverse) has zero test coverage of any kind - Task 15's billing_integration_test.go was never actually written. Next: write it and run against a real isolated Postgres.
Billing integration tests: complete (2 commits). Wrote services/gateway/internal/storage/billing_integration_test.go and ran it against a real Postgres - 30 PASS, 1 SKIP, 0 FAIL. Found 2 real bugs in billing.go: (1) CRITICAL loadFundingPreference queried non-existent table user_billing_policies instead of billing_profiles, meaning every Reserve failed - fixed; (2) IMPORTANT no retry on SQLSTATE 40001, so two concurrent same-user reservations deterministically lose one to ErrUnavailable even when funded - reported, NOT fixed (skipped test left in place). Also fixed 3 fixture bugs in recovery_integration_test.go that had never been run. Test DB role had zero privileges on base tables, so the harness provisions its own schema from drizzle/*.sql. See billing-integration-test-report.md.
