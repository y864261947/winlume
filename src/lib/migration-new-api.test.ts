import { describe, expect, it } from "vitest";
import { buildMigrationPlan, encryptChannelArtifact, parseSqlSnapshot } from "../../scripts/migrate-new-api";
import { hashApiKey } from "./platform/api-keys";

const bcryptHash = "$2b$12$LQv3c1yqBwDCCY1ZPK7e..d4QxxsN5Pwi5UmZm0u4dhmqmdld9.gS";

describe("new-api migration planning", () => {
  it("maps bcrypt/API-key history and derives an opening balance without leaking secrets", () => {
    const legacyToken = "sk-legacy-token-do-not-print";
    const channelSecret = "provider-secret-do-not-print";
    const plan = buildMigrationPlan({
      users: [
        {
          id: 7,
          username: "Alice",
          display_name: "Alice",
          email: "alice@example.test",
          password: bcryptHash,
          status: 1,
          role: 10,
          quota: 1000,
        },
      ],
      tokens: [{ id: 11, user_id: 7, key: legacyToken, status: 1, remain_quota: 600 }],
      logs: [{ id: 22, user_id: 7, type: 2, model_name: "gpt-test", quota: 100, prompt_tokens: 20, completion_tokens: 10 }],
      topups: [{ id: 33, user_id: 7, trade_no: "topup-33", payment_provider: "stripe", amount: 500, money: 1.25, status: "success" }],
      channels: [{ id: 44, name: "Primary", key: channelSecret, base_url: "https://provider.example", models: "gpt-test" }],
    });

    expect(plan.users[0]).toMatchObject({ legacyId: 7, username: "alice", passwordHash: bcryptHash, platformRole: "admin" });
    expect(plan.apiKeys[0]?.keyHash).toBe(hashApiKey(legacyToken));
    expect(plan.usage[0]).toMatchObject({ tokenLegacyId: null, costMicrocredits: BigInt(100) });
    expect(plan.balances[0]).toMatchObject({ currentQuotaMicrocredits: BigInt(1000), openingMicrocredits: BigInt(600) });
    expect(plan.report.balances).toMatchObject({ currentQuotaMicrocredits: "1000", historyCreditsMicrocredits: "500", historyDebitsMicrocredits: "100", computedOpeningMicrocredits: "600" });
    expect(plan.report.channels.plaintextSecretsSeen).toBe(1);

    const report = JSON.stringify(plan.report);
    expect(report).not.toContain(legacyToken);
    expect(report).not.toContain(channelSecret);
    expect(report).not.toContain(bcryptHash);
  });

  it("creates an opaque encrypted channel handoff instead of a plaintext report payload", () => {
    const secret = "provider-secret-do-not-print";
    const artifact = encryptChannelArtifact([{ key: secret, name: "Primary" }], "test-channel-encryption-key");
    const encoded = JSON.stringify(artifact);

    expect(artifact).toMatchObject({ version: 1, algorithm: "aes-256-gcm" });
    expect(encoded).not.toContain(secret);
  });

  it("accepts restricted INSERT SQL snapshots without executing SQL", () => {
    const snapshot = parseSqlSnapshot(`
      INSERT INTO users (id, username, password, status, quota) VALUES (1, 'alice', '${bcryptHash}', 1, 42);
      INSERT INTO tokens (id, user_id, key, status) VALUES (2, 1, 'sk-token', 1);
      INSERT INTO top_ups (id, user_id, trade_no, payment_provider, amount, money, status) VALUES (3, 1, 'topup-3', 'stripe', 8, 1.00, 'success');
    `);
    const plan = buildMigrationPlan(snapshot);

    expect(plan.users).toHaveLength(1);
    expect(plan.apiKeys).toHaveLength(1);
    expect(plan.payments).toHaveLength(1);
    expect(plan.balances[0]?.currentQuotaMicrocredits).toBe(BigInt(42));
  });
});
