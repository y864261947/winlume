import { and, eq, gt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { PlatformDatabase } from "../db/client";
import { authChallenges } from "../db/schema";

export type AuthChallengePurpose = "signup" | "password_reset";

export type AuthChallengeRecord = {
  id: string;
  purpose: AuthChallengePurpose;
  email: string;
  username: string | null;
  passwordHash: string | null;
  codeHash: string;
  expiresAt: Date;
  attemptCount: number;
  lastSentAt: Date;
  createdAt: Date;
};

export interface CreateAuthChallengeInput {
  purpose: AuthChallengePurpose;
  email: string;
  username?: string | null;
  passwordHash?: string | null;
  codeHash: string;
  expiresAt: Date;
  lastSentAt?: Date;
}

const memory = new Map<string, AuthChallengeRecord>();
let tableMissing = false;

function memoryKey(purpose: AuthChallengePurpose, email: string) {
  return `${purpose}:${email}`;
}

function isUndefinedTable(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i += 1) {
    if ("code" in current && (current as { code?: string }).code === "42P01") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export class AuthChallengeRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async replace(input: CreateAuthChallengeInput): Promise<AuthChallengeRecord> {
    const record: AuthChallengeRecord = {
      id: randomUUID(),
      purpose: input.purpose,
      email: input.email,
      username: input.username ?? null,
      passwordHash: input.passwordHash ?? null,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attemptCount: 0,
      lastSentAt: input.lastSentAt ?? new Date(),
      createdAt: new Date(),
    };
    if (tableMissing) {
      memory.set(memoryKey(input.purpose, input.email), record);
      return record;
    }
    try {
      await this.database
        .delete(authChallenges)
        .where(and(eq(authChallenges.purpose, input.purpose), eq(authChallenges.email, input.email)));
      const [created] = await this.database
        .insert(authChallenges)
        .values({
          purpose: input.purpose,
          email: input.email,
          username: input.username ?? null,
          passwordHash: input.passwordHash ?? null,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          lastSentAt: record.lastSentAt,
        })
        .returning();
      if (!created) throw new Error("Failed to store auth challenge.");
      return created;
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
      tableMissing = true;
      memory.set(memoryKey(input.purpose, input.email), record);
      return record;
    }
  }

  async findActive(purpose: AuthChallengePurpose, email: string, now = new Date()): Promise<AuthChallengeRecord | null> {
    if (tableMissing) {
      const record = memory.get(memoryKey(purpose, email));
      if (!record || record.expiresAt.getTime() <= now.getTime()) return null;
      return record;
    }
    try {
      const [row] = await this.database
        .select()
        .from(authChallenges)
        .where(and(
          eq(authChallenges.purpose, purpose),
          eq(authChallenges.email, email),
          gt(authChallenges.expiresAt, now),
        ))
        .limit(1);
      return row ?? null;
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
      tableMissing = true;
      return this.findActive(purpose, email, now);
    }
  }

  async incrementAttempts(id: string): Promise<number> {
    if (tableMissing) {
      for (const record of memory.values()) {
        if (record.id === id) {
          record.attemptCount += 1;
          return record.attemptCount;
        }
      }
      return 0;
    }
    try {
      const [row] = await this.database
        .update(authChallenges)
        .set({ attemptCount: sql`${authChallenges.attemptCount} + 1` })
        .where(eq(authChallenges.id, id))
        .returning({ attemptCount: authChallenges.attemptCount });
      return row?.attemptCount ?? 0;
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
      tableMissing = true;
      return this.incrementAttempts(id);
    }
  }

  async deleteById(id: string): Promise<void> {
    if (tableMissing) {
      for (const [key, record] of memory) {
        if (record.id === id) memory.delete(key);
      }
      return;
    }
    try {
      await this.database.delete(authChallenges).where(eq(authChallenges.id, id));
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
      tableMissing = true;
      await this.deleteById(id);
    }
  }
}

export function resetAuthChallengeMemoryForTests() {
  memory.clear();
  tableMissing = false;
}
