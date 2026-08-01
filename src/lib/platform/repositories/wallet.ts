import { and, desc, eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { usageEvents, walletLedgerEntries, wallets } from "../db/schema";
import type { LedgerEntryType, UsageEventStatus } from "../types";

export type WalletRecord = InferSelectModel<typeof wallets>;
export type WalletLedgerEntryRecord = InferSelectModel<typeof walletLedgerEntries>;
export type UsageEventRecord = InferSelectModel<typeof usageEvents>;

export interface AppendLedgerEntryInput {
  walletId: string;
  entryType: LedgerEntryType;
  amountMicrocredits: bigint;
  usageEventId?: string | null;
  idempotencyKey?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordUsageInput {
  userId: string;
  organizationId?: string | null;
  apiKeyId?: string | null;
  idempotencyKey: string;
  requestId?: string | null;
  provider: string;
  model: string;
  inputTokens?: bigint;
  outputTokens?: bigint;
  totalTokens?: bigint;
  costMicrocredits: bigint;
  status?: UsageEventStatus;
  metadata?: Record<string, unknown>;
}

export type ReserveUsageInput = RecordUsageInput;

export interface SettleReservedUsageInput {
  userId: string;
  idempotencyKey: string;
  costMicrocredits: bigint;
  requestId?: string | null;
  model?: string;
  inputTokens?: bigint;
  outputTokens?: bigint;
  totalTokens?: bigint;
}

export interface ReverseReservedUsageInput {
  userId: string;
  idempotencyKey: string;
}

export class InsufficientWalletBalanceError extends Error {
  constructor() {
    super("Insufficient wallet balance for this request.");
    this.name = "InsufficientWalletBalanceError";
  }
}

export class WalletRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async ensureForUser(userId: string): Promise<WalletRecord> {
    await this.database.insert(wallets).values({ userId }).onConflictDoNothing({ target: wallets.userId });
    const [wallet] = await this.database.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    if (!wallet) throw new Error("Failed to create wallet.");
    return wallet;
  }

  async getByUserId(userId: string): Promise<WalletRecord | null> {
    const [wallet] = await this.database.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return wallet ?? null;
  }

  async getBalance(walletId: string): Promise<bigint> {
    const [result] = await this.database
      .select({ balance: sql<string>`coalesce(sum(${walletLedgerEntries.amountMicrocredits}), 0)` })
      .from(walletLedgerEntries)
      .where(eq(walletLedgerEntries.walletId, walletId));
    return BigInt(result?.balance ?? "0");
  }

  async listLedgerEntries(walletId: string, limit = 100): Promise<WalletLedgerEntryRecord[]> {
    return this.database
      .select()
      .from(walletLedgerEntries)
      .where(eq(walletLedgerEntries.walletId, walletId))
      .orderBy(desc(walletLedgerEntries.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
  }

  async appendLedgerEntry(input: AppendLedgerEntryInput): Promise<WalletLedgerEntryRecord> {
    if (input.amountMicrocredits === BigInt(0)) throw new Error("A ledger entry amount cannot be zero.");
    const [entry] = await this.database
      .insert(walletLedgerEntries)
      .values({
        walletId: input.walletId,
        entryType: input.entryType,
        amountMicrocredits: input.amountMicrocredits,
        usageEventId: input.usageEventId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        reference: input.reference ?? null,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing({
        target: [walletLedgerEntries.walletId, walletLedgerEntries.idempotencyKey],
      })
      .returning();
    if (entry) return entry;
    if (!input.idempotencyKey) throw new Error("Ledger entry was not persisted.");
    const [existing] = await this.database
      .select()
      .from(walletLedgerEntries)
      .where(and(eq(walletLedgerEntries.walletId, input.walletId), eq(walletLedgerEntries.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (!existing) throw new Error("Ledger entry was not persisted.");
    return existing;
  }

  /**
   * Reserve a maximum request charge before forwarding to an upstream. A
   * negative immutable `hold` entry lowers the spendable balance until the
   * request is settled or reversed. The advisory lock makes concurrent
   * reservations for one account serializable without a mutable balance cache.
   */
  async reserveUsage(input: ReserveUsageInput): Promise<{ usage: UsageEventRecord; hold: WalletLedgerEntryRecord | null }> {
    if (input.costMicrocredits < BigInt(0)) throw new Error("Usage cost cannot be negative.");
    const wallet = await this.ensureForUser(input.userId);
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
      const [existing] = await tx
        .select()
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, input.userId), eq(usageEvents.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (existing) return { usage: existing, hold: null };

      const [balanceResult] = await tx
        .select({ balance: sql<string>`coalesce(sum(${walletLedgerEntries.amountMicrocredits}), 0)` })
        .from(walletLedgerEntries)
        .where(eq(walletLedgerEntries.walletId, wallet.id));
      const balance = BigInt(balanceResult?.balance ?? "0");
      if (balance < input.costMicrocredits) throw new InsufficientWalletBalanceError();

      const [usage] = await tx
        .insert(usageEvents)
        .values({
          userId: input.userId,
          organizationId: input.organizationId ?? null,
          apiKeyId: input.apiKeyId ?? null,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId ?? null,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens ?? BigInt(0),
          outputTokens: input.outputTokens ?? BigInt(0),
          totalTokens: input.totalTokens ?? (input.inputTokens ?? BigInt(0)) + (input.outputTokens ?? BigInt(0)),
          costMicrocredits: input.costMicrocredits,
          status: "reserved",
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!usage) throw new Error("Usage event was not persisted.");
      if (input.costMicrocredits === BigInt(0)) return { usage, hold: null };

      const [hold] = await tx
        .insert(walletLedgerEntries)
        .values({
          walletId: wallet.id,
          usageEventId: usage.id,
          entryType: "hold",
          amountMicrocredits: -input.costMicrocredits,
          idempotencyKey: `hold:${usage.id}`,
          reference: input.requestId ?? input.idempotencyKey,
          metadata: input.metadata ?? {},
        })
        .returning();
      if (!hold) throw new Error("Usage hold was not persisted.");
      return { usage, hold };
    });
  }

  /** Replace a prior hold with the actual immutable debit. Safe to retry. */
  async settleReservedUsage(input: SettleReservedUsageInput): Promise<UsageEventRecord | null> {
    if (input.costMicrocredits < BigInt(0)) throw new Error("Usage cost cannot be negative.");
    const wallet = await this.ensureForUser(input.userId);
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
      const [usage] = await tx
        .select()
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, input.userId), eq(usageEvents.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (!usage) return null;
      if (usage.status === "settled") return usage;
      if (usage.status !== "reserved") throw new Error("Usage event cannot be settled from its current state.");

      const held = usage.costMicrocredits;
      const [balanceResult] = await tx
        .select({ balance: sql<string>`coalesce(sum(${walletLedgerEntries.amountMicrocredits}), 0)` })
        .from(walletLedgerEntries)
        .where(eq(walletLedgerEntries.walletId, wallet.id));
      // The hold is already part of the balance. Add it back conceptually
      // before checking whether the final debit can be safely committed.
      const balanceBeforeSettlement = BigInt(balanceResult?.balance ?? "0") + held;
      if (balanceBeforeSettlement < input.costMicrocredits) throw new InsufficientWalletBalanceError();

      if (held > BigInt(0)) {
        await tx.insert(walletLedgerEntries).values({
          walletId: wallet.id,
          usageEventId: usage.id,
          entryType: "release",
          amountMicrocredits: held,
          idempotencyKey: `release:${usage.id}`,
          reference: usage.requestId ?? usage.idempotencyKey,
          metadata: { usageEventId: usage.id },
        }).onConflictDoNothing({ target: [walletLedgerEntries.walletId, walletLedgerEntries.idempotencyKey] });
      }
      if (input.costMicrocredits > BigInt(0)) {
        await tx.insert(walletLedgerEntries).values({
          walletId: wallet.id,
          usageEventId: usage.id,
          entryType: "debit",
          amountMicrocredits: -input.costMicrocredits,
          idempotencyKey: `usage:${usage.id}`,
          reference: input.requestId ?? usage.requestId ?? usage.idempotencyKey,
          metadata: { usageEventId: usage.id },
        }).onConflictDoNothing({ target: [walletLedgerEntries.walletId, walletLedgerEntries.idempotencyKey] });
      }
      const [updated] = await tx
        .update(usageEvents)
        .set({
          costMicrocredits: input.costMicrocredits,
          requestId: input.requestId ?? usage.requestId,
          model: input.model?.trim() || usage.model,
          inputTokens: input.inputTokens ?? usage.inputTokens,
          outputTokens: input.outputTokens ?? usage.outputTokens,
          totalTokens: input.totalTokens ?? usage.totalTokens,
          status: "settled",
          updatedAt: new Date(),
        })
        .where(eq(usageEvents.id, usage.id))
        .returning();
      return updated ?? usage;
    });
  }

  /** Release a failed request's hold without deleting its audit trail. */
  async reverseReservedUsage(input: ReverseReservedUsageInput): Promise<UsageEventRecord | null> {
    const wallet = await this.ensureForUser(input.userId);
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
      const [usage] = await tx
        .select()
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, input.userId), eq(usageEvents.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (!usage || usage.status === "settled" || usage.status === "reversed") return usage ?? null;
      if (usage.status !== "reserved") throw new Error("Usage event cannot be reversed from its current state.");
      if (usage.costMicrocredits > BigInt(0)) {
        await tx.insert(walletLedgerEntries).values({
          walletId: wallet.id,
          usageEventId: usage.id,
          entryType: "release",
          amountMicrocredits: usage.costMicrocredits,
          idempotencyKey: `release:${usage.id}`,
          reference: usage.requestId ?? usage.idempotencyKey,
          metadata: { usageEventId: usage.id, reason: "upstream_error" },
        }).onConflictDoNothing({ target: [walletLedgerEntries.walletId, walletLedgerEntries.idempotencyKey] });
      }
      const [updated] = await tx
        .update(usageEvents)
        .set({ status: "reversed", updatedAt: new Date() })
        .where(eq(usageEvents.id, usage.id))
        .returning();
      return updated ?? usage;
    });
  }

  async recordUsage(input: RecordUsageInput): Promise<{ usage: UsageEventRecord; ledger: WalletLedgerEntryRecord | null }> {
    if (input.costMicrocredits < BigInt(0)) throw new Error("Usage cost cannot be negative.");
    const wallet = await this.ensureForUser(input.userId);
    return this.database.transaction(async (tx) => {
      const [usage] = await tx
        .insert(usageEvents)
        .values({
          userId: input.userId,
          organizationId: input.organizationId ?? null,
          apiKeyId: input.apiKeyId ?? null,
          idempotencyKey: input.idempotencyKey,
          requestId: input.requestId ?? null,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens ?? BigInt(0),
          outputTokens: input.outputTokens ?? BigInt(0),
          totalTokens: input.totalTokens ?? (input.inputTokens ?? BigInt(0)) + (input.outputTokens ?? BigInt(0)),
          costMicrocredits: input.costMicrocredits,
          status: input.status ?? "settled",
          metadata: input.metadata ?? {},
        })
        .onConflictDoNothing({ target: [usageEvents.userId, usageEvents.idempotencyKey] })
        .returning();

      const persistedUsage = usage ?? (await tx
        .select()
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, input.userId), eq(usageEvents.idempotencyKey, input.idempotencyKey)))
        .limit(1))[0];
      if (!persistedUsage) throw new Error("Usage event was not persisted.");

      if (input.costMicrocredits === BigInt(0)) return { usage: persistedUsage, ledger: null };

      const [ledger] = await tx
        .insert(walletLedgerEntries)
        .values({
          walletId: wallet.id,
          usageEventId: persistedUsage.id,
          entryType: "debit",
          amountMicrocredits: -input.costMicrocredits,
          idempotencyKey: `usage:${persistedUsage.id}`,
          reference: input.requestId ?? input.idempotencyKey,
          metadata: input.metadata ?? {},
        })
        .onConflictDoNothing({ target: [walletLedgerEntries.walletId, walletLedgerEntries.idempotencyKey] })
        .returning();
      const persistedLedger = ledger ?? (await tx
        .select()
        .from(walletLedgerEntries)
        .where(and(eq(walletLedgerEntries.walletId, wallet.id), eq(walletLedgerEntries.idempotencyKey, `usage:${persistedUsage.id}`)))
        .limit(1))[0];
      if (!persistedLedger) throw new Error("Usage ledger entry was not persisted.");
      return { usage: persistedUsage, ledger: persistedLedger };
    });
  }
}
