import { and, desc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { paymentOrders, paymentProviders, subscriptionPlans, subscriptions, walletLedgerEntries, wallets } from "../db/schema";
import type { PaymentProviderStatus, SubscriptionStatus } from "../types";

export type PaymentProviderRecord = InferSelectModel<typeof paymentProviders>;
export type SubscriptionPlanRecord = InferSelectModel<typeof subscriptionPlans>;
export type SubscriptionRecord = InferSelectModel<typeof subscriptions>;
export type PaymentOrderRecord = InferSelectModel<typeof paymentOrders>;

export interface UpsertPaymentProviderInput {
  slug: string;
  name: string;
  status?: PaymentProviderStatus;
  configurationCiphertext?: string | null;
  webhookSecretCiphertext?: string | null;
  supportedCurrencies?: string[];
}

export interface CreatePaymentOrderInput {
  userId: string;
  paymentProviderId: string;
  subscriptionId?: string | null;
  orderReference: string;
  externalReference?: string | null;
  amountMinor: bigint;
  currency: string;
  creditsMicrocredits: bigint;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
}

export class BillingRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async listPaymentProviders(status: PaymentProviderStatus = "active"): Promise<PaymentProviderRecord[]> {
    return this.database.select().from(paymentProviders).where(eq(paymentProviders.status, status));
  }

  async upsertPaymentProvider(input: UpsertPaymentProviderInput): Promise<PaymentProviderRecord> {
    const slug = input.slug.trim().toLowerCase();
    const name = input.name.trim();
    if (!slug || !name) throw new Error("Payment provider slug and name are required.");
    const [provider] = await this.database
      .insert(paymentProviders)
      .values({
        slug,
        name,
        status: input.status ?? "active",
        configurationCiphertext: input.configurationCiphertext ?? null,
        webhookSecretCiphertext: input.webhookSecretCiphertext ?? null,
        supportedCurrencies: input.supportedCurrencies ?? ["USD"],
      })
      .onConflictDoUpdate({
        target: paymentProviders.slug,
        set: {
          name,
          status: input.status ?? "active",
          configurationCiphertext: input.configurationCiphertext ?? null,
          webhookSecretCiphertext: input.webhookSecretCiphertext ?? null,
          supportedCurrencies: input.supportedCurrencies ?? ["USD"],
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!provider) throw new Error("Failed to save payment provider.");
    return provider;
  }

  async listSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
    return this.database
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
  }

  async findPlanById(id: string): Promise<SubscriptionPlanRecord | null> {
    const [plan] = await this.database.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    return plan ?? null;
  }

  async listPaymentOrders(userId: string, limit = 50): Promise<PaymentOrderRecord[]> {
    return this.database
      .select()
      .from(paymentOrders)
      .where(eq(paymentOrders.userId, userId))
      .orderBy(desc(paymentOrders.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  async findActiveSubscription(userId: string): Promise<SubscriptionRecord | null> {
    const [subscription] = await this.database
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
      .orderBy(desc(subscriptions.currentPeriodEnd), desc(subscriptions.createdAt))
      .limit(1);
    return subscription ?? null;
  }

  async createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderRecord> {
    const [order] = await this.database
      .insert(paymentOrders)
      .values({
        userId: input.userId,
        paymentProviderId: input.paymentProviderId,
        subscriptionId: input.subscriptionId ?? null,
        orderReference: input.orderReference,
        externalReference: input.externalReference ?? null,
        amountMinor: input.amountMinor,
        currency: input.currency.toUpperCase(),
        creditsMicrocredits: input.creditsMicrocredits,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!order) throw new Error("Failed to create payment order.");
    return order;
  }

  /** Mark a verified payment callback as paid and issue one immutable credit entry. */
  async settlePaymentOrder(orderId: string, paidAt = new Date()): Promise<PaymentOrderRecord | null> {
    return this.database.transaction(async (tx) => {
      const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.id, orderId)).limit(1);
      if (!order) return null;
      if (order.status === "paid") return order;
      if (order.status !== "pending") throw new Error("Payment order is not pending.");

      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.userId)).limit(1);
      if (!wallet) throw new Error("Wallet is not provisioned for this account.");
      if (order.creditsMicrocredits !== BigInt(0)) {
        await tx.insert(walletLedgerEntries).values({
          walletId: wallet.id,
          entryType: "credit",
          amountMicrocredits: order.creditsMicrocredits,
          idempotencyKey: `payment:${order.id}`,
          reference: order.orderReference,
          metadata: { paymentOrderId: order.id },
        }).onConflictDoNothing({ target: [walletLedgerEntries.walletId, walletLedgerEntries.idempotencyKey] });
      }
      const [updated] = await tx
        .update(paymentOrders)
        .set({ status: "paid", paidAt, updatedAt: new Date() })
        .where(eq(paymentOrders.id, orderId))
        .returning();
      return updated ?? order;
    });
  }

  async setSubscriptionStatus(id: string, status: SubscriptionStatus): Promise<SubscriptionRecord | null> {
    const [subscription] = await this.database
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription ?? null;
  }
}
