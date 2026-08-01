/**
 * Migrate a controlled New API export into the WinLume platform database.
 *
 * The command is deliberately dry-run by default.  A write requires the
 * explicit --apply flag and a target DATABASE_URL. Raw credentials are
 * accepted only in memory while building
 * the import plan; reports and operational logs contain counts and hashes,
 * never plaintext passwords, tokens, API keys, or channel secrets.
 *
 * Supported sources:
 *   - JSON export (recommended): NEW_API_MIGRATION_SOURCE_FILE
 *   - a PostgreSQL source database: NEW_API_MIGRATION_SOURCE_DATABASE_URL
 *   - a restricted INSERT-only SQL snapshot (.sql)
 *
 * Usage:
 *   npm run migration:new-api -- --source-file=/secure/export.json
 *   npm run migration:new-api -- --source-file=/secure/export.json --apply
 */

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { getApiKeyPrefix, hashApiKey } from "../src/lib/platform/api-keys";

export type JsonObject = Record<string, unknown>;

export interface LegacySnapshot {
  version?: number | string;
  exportedAt?: string;
  source?: JsonObject;
  tables?: JsonObject;
  users?: unknown[];
  tokens?: unknown[];
  logs?: unknown[];
  topups?: unknown[];
  subscriptionPlans?: unknown[];
  subscriptionOrders?: unknown[];
  userSubscriptions?: unknown[];
  paymentProviders?: unknown[];
  channels?: unknown[];
  [key: string]: unknown;
}

export interface NormalizedSnapshot {
  version: number;
  exportedAt: string | null;
  users: JsonObject[];
  tokens: JsonObject[];
  logs: JsonObject[];
  topups: JsonObject[];
  subscriptionPlans: JsonObject[];
  subscriptionOrders: JsonObject[];
  userSubscriptions: JsonObject[];
  paymentProviders: JsonObject[];
  channels: JsonObject[];
}

export interface MigrationOptions {
  apply: boolean;
  sourceFile?: string;
  sourceDatabaseUrl?: string;
  targetDatabaseUrl?: string;
  reportFile?: string;
  snapshotOut?: string;
  channelArtifactFile?: string;
  channelEncryptionKey?: string;
  sourceLogDatabaseUrl?: string;
  preserveCiphertext: boolean;
  maxRows: number | null;
}

export interface EntityReconciliation {
  source: number;
  planned: number;
  imported: number;
  skipped: number;
  conflicts: number;
  errors: number;
}

export interface ReconciliationReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: "dry-run" | "apply";
  source: {
    kind: "json" | "postgres" | "sql";
    fileProvided: boolean;
    rowCounts: Record<string, number>;
  };
  entities: Record<string, EntityReconciliation>;
  balances: {
    usersWithBalance: number;
    currentQuotaMicrocredits: string;
    historyCreditsMicrocredits: string;
    historyDebitsMicrocredits: string;
    computedOpeningMicrocredits: string;
    targetVerifiedUsers: number;
    targetMismatchedUsers: number;
  };
  apiKeys: {
    rawKeysSeen: number;
    hashesAccepted: number;
    unavailable: number;
  };
  channels: {
    source: number;
    encryptedArtifactPlanned: number;
    encryptedArtifactWritten: boolean;
    plaintextSecretsSeen: number;
    ciphertextPreserved: number;
    blocked: number;
  };
  warnings: string[];
  errors: string[];
  secretPolicy: {
    reportContainsSecrets: false;
    rawApiKeysImported: false;
    oldSessionsImported: false;
    channelSecrets: "encrypted-artifact-only";
  };
}

export interface MigrationPlan {
  snapshot: NormalizedSnapshot;
  users: PlannedUser[];
  apiKeys: PlannedApiKey[];
  usage: PlannedUsage[];
  balances: PlannedBalance[];
  providers: PlannedProvider[];
  plans: PlannedPlan[];
  subscriptions: PlannedSubscription[];
  payments: PlannedPayment[];
  channels: PlannedChannel[];
  report: ReconciliationReport;
  channelArtifactPayload: JsonObject[];
}

interface PlannedUser {
  legacyId: number;
  username: string;
  displayName: string;
  email: string | null;
  passwordHash: string | null;
  status: "active" | "suspended" | "pending";
  platformRole: "user" | "admin";
  lastLoginAt: Date | null;
  createdAt: Date | null;
}

interface PlannedApiKey {
  legacyId: number;
  userLegacyId: number;
  keyPrefix: string;
  keyHash: string;
  status: "active" | "disabled" | "revoked";
  scopes: string[];
  allowedModels: string[];
  allowedGroups: string[];
  ipAllowlist: string[];
  quotaLimitMicrocredits: bigint | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date | null;
}

interface PlannedUsage {
  sourceId: string;
  userLegacyId: number;
  tokenLegacyId: number | null;
  provider: string;
  model: string;
  inputTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  costMicrocredits: bigint;
  occurredAt: Date | null;
  requestId: string | null;
  metadata: JsonObject;
}

interface PlannedBalance {
  userLegacyId: number;
  currentQuotaMicrocredits: bigint;
  openingMicrocredits: bigint;
}

interface PlannedProvider {
  sourceId: number | null;
  slug: string;
  name: string;
  status: "active" | "disabled";
  configurationCiphertext: string | null;
  webhookSecretCiphertext: string | null;
  supportedCurrencies: string[];
}

interface PlannedPlan {
  sourceId: number;
  code: string;
  name: string;
  interval: "month" | "year" | "one_time";
  priceMinor: bigint;
  currency: string;
  entitlements: JsonObject;
  active: boolean;
}

interface PlannedSubscription {
  sourceId: number;
  userLegacyId: number;
  planSourceId: number;
  providerSlug: string | null;
  externalSubscriptionId: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  metadata: JsonObject;
}

interface PlannedPayment {
  sourceId: number;
  kind: "topup" | "subscription";
  userLegacyId: number;
  providerSlug: string;
  subscriptionSourceId: number | null;
  orderReference: string;
  externalReference: string | null;
  status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  amountMinor: bigint;
  currency: string;
  creditsMicrocredits: bigint;
  paidAt: Date | null;
  createdAt: Date | null;
  ledgerCredit: boolean;
  metadata: JsonObject;
}

interface PlannedChannel {
  sourceId: number;
  name: string;
  status: "active" | "disabled";
  providerType: string;
  baseUrl: string | null;
  models: string[];
  group: string;
  opaqueCiphertext: JsonObject;
  hasPlaintextSecret: boolean;
  raw: JsonObject;
}

interface ApplyContext {
  users: Map<number, string>;
  keys: Map<number, string>;
  providers: Map<string, string>;
  plans: Map<number, string>;
  subscriptions: Map<number, string>;
  wallets: Map<number, string>;
}

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const HEX_HASH_RE = /^[a-f0-9]{64}$/i;
const SECRET_KEY_RE = /(password|passwd|secret|token|api[_.-]?key|authorization|private[_.-]?key|access[_.-]?token|webhook)/i;
const SUPPORTED_SOURCE_TABLES = new Set([
  "users",
  "user",
  "tokens",
  "token",
  "logs",
  "topups",
  "top_up",
  "top_ups",
  "subscription_plans",
  "subscription_plan",
  "subscription_orders",
  "subscription_order",
  "user_subscriptions",
  "user_subscription",
  "subscriptions",
  "payment_providers",
  "payment_provider",
  "channels",
  "channel",
]);

const SOURCE_ALIASES: Record<keyof Omit<NormalizedSnapshot, "version" | "exportedAt">, string[]> = {
  users: ["users", "user"],
  tokens: ["tokens", "token"],
  logs: ["logs", "log"],
  topups: ["topups", "top_up", "top_ups", "top-ups", "recharges"],
  subscriptionPlans: ["subscriptionPlans", "subscription_plans", "subscription-plan", "subscription_plan"],
  subscriptionOrders: ["subscriptionOrders", "subscription_orders", "subscription-order", "subscription_order"],
  userSubscriptions: ["userSubscriptions", "user_subscriptions", "user-subscription", "user_subscription", "subscriptions"],
  paymentProviders: ["paymentProviders", "payment_providers", "payment-provider", "payment_provider"],
  channels: ["channels", "channel"],
};

function emptyEntity(): EntityReconciliation {
  return { source: 0, planned: 0, imported: 0, skipped: 0, conflicts: 0, errors: 0 };
}

function entityReport(): Record<string, EntityReconciliation> {
  return Object.fromEntries(
    ["users", "apiKeys", "usage", "balances", "providers", "plans", "subscriptions", "payments", "channels"].map(
      (name) => [name, emptyEntity()],
    ),
  );
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown error";
  const normalized = message.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "unknown error";
  return SECRET_KEY_RE.test(normalized) ? "database operation failed (sensitive details omitted)" : normalized.slice(0, 240);
}

function normalizeFieldName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function field(row: JsonObject, ...names: string[]): unknown {
  const normalized = new Map(Object.keys(row).map((key) => [normalizeFieldName(key), row[key]]));
  for (const name of names) {
    const found = normalized.get(normalizeFieldName(name));
    if (found !== undefined) return found;
  }
  return undefined;
}

function textValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return fallback;
}

function nullableText(value: unknown): string | null {
  const result = textValue(value);
  return result || null;
}

function integerValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return fallback;
}

function bigintValue(value: unknown, fallback = BigInt(0)): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    try {
      return BigInt(value.trim());
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function decimalToMinor(value: unknown): bigint {
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.round(value * 100));
  const text = textValue(value);
  if (!text) return BigInt(0);
  const match = text.match(/^-?\d+(?:\.\d+)?$/);
  if (!match) return BigInt(0);
  const [whole, fraction = ""] = text.split(".");
  const cents = (fraction + "00").slice(0, 2);
  try {
    const sign = whole.startsWith("-") ? -BigInt(1) : BigInt(1);
    return sign * (BigInt(whole.replace(/^-/, "")) * BigInt(100) + BigInt(cents));
  } catch {
    return BigInt(0);
  }
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" || (typeof value === "string" && /^\d{9,}$/.test(value.trim()))) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric <= 0) return null;
      const milliseconds = Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : numeric;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean);
  const parsed = jsonValue(value);
  if (Array.isArray(parsed)) return parsed.map((item) => textValue(item)).filter(Boolean);
  return textValue(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = textValue(value).toLowerCase();
  if (["true", "1", "yes", "enabled", "active"].includes(normalized)) return true;
  if (["false", "0", "no", "disabled", "inactive"].includes(normalized)) return false;
  return fallback;
}

function statusFromLegacy(value: unknown, kind: "user" | "token" | "channel" | "payment" | "subscription"): string {
  if (typeof value === "boolean") {
    if (kind === "payment") return value ? "paid" : "pending";
    if (kind === "subscription") return value ? "active" : "expired";
    return value ? "active" : kind === "channel" ? "disabled" : "suspended";
  }
  const text = textValue(value).toLowerCase();
  const numeric = integerValue(value, -1);
  if (!text && (value === undefined || value === null || value === "")) {
    if (kind === "payment") return "pending";
    return "active";
  }
  if (kind === "user") return numeric === 1 || ["active", "enabled", "ok"].includes(text) ? "active" : numeric === 0 || text === "pending" ? "pending" : "suspended";
  if (kind === "token") return numeric === 1 || ["active", "enabled", "ok"].includes(text) ? "active" : numeric === 2 || ["disabled", "inactive"].includes(text) ? "disabled" : "revoked";
  if (kind === "channel") return numeric === 1 || ["active", "enabled", "ok"].includes(text) ? "active" : "disabled";
  if (kind === "subscription") {
    if (["trial", "trialing"].includes(text)) return "trialing";
    if (["active", "enabled", "ok", "1"].includes(text) || numeric === 1) return "active";
    if (["past_due", "past-due"].includes(text)) return "past_due";
    if (["cancelled", "canceled", "cancel"].includes(text)) return "cancelled";
    return "expired";
  }
  if (["paid", "success", "succeeded", "completed", "complete", "1"].includes(text) || numeric === 1) return "paid";
  if (["failed", "failure", "error"].includes(text)) return "failed";
  if (["refunded", "refund"].includes(text)) return "refunded";
  if (["cancelled", "canceled", "cancel"].includes(text)) return "cancelled";
  return "pending";
}

function sourceRows(snapshot: LegacySnapshot, aliases: string[]): JsonObject[] {
  const tableObject = asObject(snapshot.tables);
  for (const alias of aliases) {
    const direct = snapshot[alias];
    if (Array.isArray(direct)) return direct.map(asObject);
    const table = tableObject[alias];
    if (Array.isArray(table)) return table.map(asObject);
  }
  const normalizedKeys = new Map(Object.keys({ ...snapshot, ...tableObject }).map((key) => [normalizeFieldName(key), key]));
  for (const alias of aliases) {
    const key = normalizedKeys.get(normalizeFieldName(alias));
    if (!key) continue;
    const value = snapshot[key] ?? tableObject[key];
    if (Array.isArray(value)) return value.map(asObject);
  }
  return [];
}

export function normalizeSnapshot(input: LegacySnapshot): NormalizedSnapshot {
  const result = {} as NormalizedSnapshot;
  for (const key of Object.keys(SOURCE_ALIASES) as Array<keyof Omit<NormalizedSnapshot, "version" | "exportedAt">>) {
    result[key] = sourceRows(input, SOURCE_ALIASES[key]);
  }
  result.version = integerValue(input.version, 1);
  result.exportedAt = nullableText(input.exportedAt);
  return result;
}

function scrubSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => scrubSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value as JsonObject)) {
    if (SECRET_KEY_RE.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = scrubSecrets(item, depth + 1);
    }
  }
  return output;
}

function safeMetadata(value: unknown): JsonObject {
  const scrubbed = scrubSecrets(value);
  return asObject(scrubbed);
}

function validBcrypt(value: unknown): string | null {
  const text = textValue(value);
  return BCRYPT_RE.test(text) ? text : null;
}

function sourceId(row: JsonObject, fallback: number): number {
  return integerValue(field(row, "id", "Id", "legacyId", "legacy_id"), fallback);
}

function userIdFrom(row: JsonObject): number {
  return integerValue(field(row, "userId", "user_id", "userid", "ownerId", "owner_id"), 0);
}

function keyHashAndPrefix(raw: unknown, explicitHash: unknown): { hash: string; prefix: string } | null {
  const explicit = textValue(explicitHash).toLowerCase();
  const rawText = textValue(raw);
  if (HEX_HASH_RE.test(explicit)) return { hash: explicit, prefix: `legacy_${explicit.slice(0, 10)}` };
  if (!rawText) return null;
  if (HEX_HASH_RE.test(rawText)) return { hash: rawText.toLowerCase(), prefix: `legacy_${rawText.slice(0, 10)}` };
  const hash = hashApiKey(rawText);
  const prefix = getApiKeyPrefix(rawText) ?? `legacy_${hash.slice(0, 10)}`;
  return { hash, prefix: prefix.slice(0, 32) };
}

function providerSlug(value: unknown, fallback: string): string {
  const normalized = textValue(value, fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 80);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function ciphertextField(row: JsonObject, ...names: string[]): string | null {
  for (const name of names) {
    const value = field(row, name);
    const text = textValue(value);
    if (text) return text;
  }
  return null;
}

function sourceSecretPresent(row: JsonObject): boolean {
  return Object.keys(row).some((key) => {
    const normalized = normalizeFieldName(key);
    const isSecret = SECRET_KEY_RE.test(key) || normalized === "key" || normalized === "credential" || normalized === "credentials";
    return isSecret && !/ciphertext/i.test(key) && Boolean(row[key]);
  });
}

function mapPlanInterval(row: JsonObject): "month" | "year" | "one_time" {
  const unit = textValue(field(row, "durationUnit", "duration_unit", "interval", "period")).toLowerCase();
  if (unit.includes("year")) return "year";
  if (unit.includes("month")) return "month";
  return "one_time";
}

function mapPlanCode(row: JsonObject, id: number): string {
  const supplied = textValue(field(row, "code", "slug", "name"));
  const normalized = supplied.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return (normalized ? `legacy-${normalized}` : `legacy-plan-${id}`).slice(0, 80);
}

function countRows(snapshot: NormalizedSnapshot): Record<string, number> {
  return {
    users: snapshot.users.length,
    tokens: snapshot.tokens.length,
    logs: snapshot.logs.length,
    topups: snapshot.topups.length,
    subscriptionPlans: snapshot.subscriptionPlans.length,
    subscriptionOrders: snapshot.subscriptionOrders.length,
    userSubscriptions: snapshot.userSubscriptions.length,
    paymentProviders: snapshot.paymentProviders.length,
    channels: snapshot.channels.length,
  };
}

function addWarning(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/** Build a deterministic, secret-free reconciliation plan from a source export. */
export function buildMigrationPlan(
  input: LegacySnapshot,
  options: Partial<Pick<MigrationOptions, "apply" | "preserveCiphertext">> = {},
): MigrationPlan {
  const apply = options.apply ?? false;
  const preserveCiphertext = options.preserveCiphertext ?? true;
  const snapshot = normalizeSnapshot(input);
  const entities = entityReport();
  const warnings: string[] = [];
  const errors: string[] = [];
  const users: PlannedUser[] = [];
  const userIds = new Set<number>();
  const usernames = new Set<string>();
  const emails = new Set<string>();

  entities.users.source = snapshot.users.length;
  for (let index = 0; index < snapshot.users.length; index += 1) {
    const row = snapshot.users[index];
    const legacyId = sourceId(row, index + 1);
    const username = textValue(field(row, "username", "userName", "login")).toLowerCase();
    if (!legacyId || !username || username.length > 64) {
      entities.users.skipped += 1;
      addWarning(warnings, "存在缺少合法 ID/用户名的用户，已跳过");
      continue;
    }
    if (userIds.has(legacyId) || usernames.has(username)) {
      entities.users.conflicts += 1;
      addWarning(warnings, "用户导出中存在重复 ID/用户名，重复行已跳过");
      continue;
    }
    const email = nullableText(field(row, "email"))?.toLowerCase();
    if (email && emails.has(email)) {
      entities.users.conflicts += 1;
      addWarning(warnings, "用户导出中存在重复邮箱，重复行已跳过");
      continue;
    }
    const passwordCandidate = field(row, "passwordHash", "password_hash", "password");
    const passwordHash = validBcrypt(passwordCandidate);
    if (passwordCandidate !== undefined && !passwordHash) addWarning(warnings, "存在非 bcrypt 用户密码，已跳过密码字段并要求用户重设");
    const legacyRole = field(row, "role", "platformRole", "platform_role");
    const roleText = textValue(legacyRole).toLowerCase();
    users.push({
      legacyId,
      username,
      displayName: textValue(field(row, "displayName", "display_name"), username).slice(0, 120),
      email: email?.slice(0, 320) ?? null,
      passwordHash,
      status: statusFromLegacy(field(row, "status"), "user") as PlannedUser["status"],
      platformRole: integerValue(legacyRole, 1) >= 10 || roleText === "admin" || roleText === "root" || roleText === "administrator" ? "admin" : "user",
      lastLoginAt: dateValue(field(row, "lastLoginAt", "last_login_at")),
      createdAt: dateValue(field(row, "createdAt", "created_at")),
    });
    userIds.add(legacyId);
    usernames.add(username);
    if (email) emails.add(email);
  }
  entities.users.planned = users.length;

  const apiKeys: PlannedApiKey[] = [];
  const apiKeyHashes = new Set<string>();
  entities.apiKeys.source = snapshot.tokens.length;
  let rawKeysSeen = 0;
  let hashesAccepted = 0;
  let unavailableKeys = 0;
  for (let index = 0; index < snapshot.tokens.length; index += 1) {
    const row = snapshot.tokens[index];
    const legacyId = sourceId(row, index + 1);
    const owner = userIdFrom(row);
    if (!userIds.has(owner)) {
      entities.apiKeys.skipped += 1;
      addWarning(warnings, "存在引用未知用户的 API token，已跳过");
      continue;
    }
    const raw = field(row, "key", "token", "apiKey", "api_key");
    const explicitHash = field(row, "keyHash", "key_hash", "tokenHash", "token_hash");
    if (raw !== undefined && textValue(raw)) rawKeysSeen += 1;
    const mapped = keyHashAndPrefix(raw, explicitHash);
    if (!mapped) {
      unavailableKeys += 1;
      entities.apiKeys.skipped += 1;
      addWarning(warnings, "存在没有可验证密文/哈希的 token，已跳过");
      continue;
    }
    if (apiKeyHashes.has(mapped.hash)) {
      entities.apiKeys.conflicts += 1;
      addWarning(warnings, "token 导出中存在重复 key hash，重复行已跳过");
      continue;
    }
    apiKeyHashes.add(mapped.hash);
    hashesAccepted += 1;
    const modelLimits = jsonValue(field(row, "modelLimits", "model_limits"));
    apiKeys.push({
      legacyId,
      userLegacyId: owner,
      keyPrefix: mapped.prefix,
      keyHash: mapped.hash,
      status: statusFromLegacy(field(row, "status"), "token") as PlannedApiKey["status"],
      scopes: listValue(field(row, "scopes")),
      allowedModels: Array.isArray(modelLimits) ? modelLimits.map((value) => textValue(value)).filter(Boolean) : [],
      allowedGroups: listValue(field(row, "group", "groups")),
      ipAllowlist: listValue(field(row, "allowIps", "allow_ips", "ipAllowlist")),
      quotaLimitMicrocredits: booleanValue(field(row, "unlimitedQuota", "unlimited_quota")) ? null : bigintValue(field(row, "remainQuota", "remain_quota"), BigInt(0)),
      expiresAt: bigintValue(field(row, "expiredTime", "expired_time"), BigInt(-1)) < BigInt(0) ? null : dateValue(field(row, "expiredTime", "expired_time")),
      lastUsedAt: dateValue(field(row, "accessedTime", "accessed_time")),
      createdAt: dateValue(field(row, "createdTime", "created_time")),
    });
  }
  entities.apiKeys.planned = apiKeys.length;

  const providers: PlannedProvider[] = [];
  const providerSeen = new Set<string>();
  entities.providers.source = snapshot.paymentProviders.length;
  const addProvider = (row: JsonObject, fallbackId: number | null, fallbackSlug: string): void => {
    const slug = providerSlug(field(row, "slug", "code", "provider", "paymentProvider", "payment_provider"), fallbackSlug);
    if (providerSeen.has(slug)) return;
    providerSeen.add(slug);
    const configurationCiphertext = ciphertextField(row, "configurationCiphertext", "configuration_ciphertext", "configCiphertext", "config_ciphertext");
    const webhookSecretCiphertext = ciphertextField(row, "webhookSecretCiphertext", "webhook_secret_ciphertext", "webhookCiphertext", "webhook_ciphertext");
    const currencies = unique(listValue(field(row, "supportedCurrencies", "supported_currencies"))).map((item) => item.toUpperCase()).slice(0, 20);
    if (sourceSecretPresent(row) && !configurationCiphertext && !webhookSecretCiphertext) {
      addWarning(warnings, "支付 provider 含明文敏感字段，未写入目标配置；请用目标密钥系统重新配置");
    }
    providers.push({
      sourceId: fallbackId,
      slug,
      name: textValue(field(row, "name", "displayName"), slug).slice(0, 120),
      status: textValue(field(row, "status"), "active").toLowerCase() === "disabled" ? "disabled" : "active",
      configurationCiphertext: preserveCiphertext ? configurationCiphertext : null,
      webhookSecretCiphertext: preserveCiphertext ? webhookSecretCiphertext : null,
      supportedCurrencies: currencies.length > 0 ? currencies : ["USD"],
    });
  };
  snapshot.paymentProviders.forEach((row, index) => addProvider(row, sourceId(row, index + 1), `legacy-provider-${index + 1}`));
  for (const row of [...snapshot.topups, ...snapshot.subscriptionOrders]) {
    const rawProvider = field(row, "paymentProvider", "payment_provider", "provider", "paymentMethod", "payment_method");
    const slug = providerSlug(rawProvider, "legacy");
    addProvider({ slug }, null, slug);
  }
  for (const row of snapshot.userSubscriptions) {
    const rawProvider = field(row, "paymentProvider", "payment_provider", "provider");
    if (textValue(rawProvider)) addProvider({ slug: textValue(rawProvider) }, null, providerSlug(rawProvider, "legacy"));
  }
  entities.providers.planned = providers.length;

  const plans: PlannedPlan[] = [];
  const planIds = new Set<number>();
  const planCodes = new Set<string>();
  entities.plans.source = snapshot.subscriptionPlans.length;
  snapshot.subscriptionPlans.forEach((row, index) => {
    const id = sourceId(row, index + 1);
    if (planIds.has(id)) {
      entities.plans.conflicts += 1;
      return;
    }
    const totalAmount = bigintValue(field(row, "totalAmount", "total_amount", "quota", "amount"));
    let code = mapPlanCode(row, id);
    if (planCodes.has(code)) {
      code = `legacy-plan-${id}`;
      entities.plans.conflicts += 1;
      addWarning(warnings, "套餐导出中存在重复 code，已改用 legacy ID code");
    }
    plans.push({
      sourceId: id,
      code,
      name: textValue(field(row, "title", "name"), `Legacy plan ${id}`).slice(0, 120),
      interval: mapPlanInterval(row),
      priceMinor: decimalToMinor(field(row, "priceAmount", "price_amount", "price", "money")),
      currency: textValue(field(row, "currency"), "USD").toUpperCase().slice(0, 8),
      entitlements: safeMetadata({
        subtitle: field(row, "subtitle"),
        totalAmount,
        quotaCapAmount: bigintValue(field(row, "quotaCapAmount", "quota_cap_amount")),
        quotaResetPeriod: field(row, "quotaResetPeriod", "quota_reset_period"),
        upgradeGroup: field(row, "upgradeGroup", "upgrade_group"),
      }),
      active: booleanValue(field(row, "enabled", "active"), true),
    });
    planIds.add(id);
    planCodes.add(code);
  });
  for (const row of snapshot.userSubscriptions) {
    const id = integerValue(field(row, "planId", "plan_id"), 0);
    if (id && !planIds.has(id)) {
      plans.push({ sourceId: id, code: `legacy-plan-${id}`, name: `Legacy plan ${id}`, interval: "one_time", priceMinor: BigInt(0), currency: "USD", entitlements: {}, active: false });
      planIds.add(id);
      planCodes.add(`legacy-plan-${id}`);
      addWarning(warnings, "订阅引用了未导出的套餐，已创建停用占位套餐");
    }
  }
  entities.plans.planned = plans.length;

  const subscriptions: PlannedSubscription[] = [];
  entities.subscriptions.source = snapshot.userSubscriptions.length;
  snapshot.userSubscriptions.forEach((row, index) => {
    const id = sourceId(row, index + 1);
    const owner = userIdFrom(row);
    const planSourceId = integerValue(field(row, "planId", "plan_id"), 0);
    if (!userIds.has(owner) || !planIds.has(planSourceId)) {
      entities.subscriptions.skipped += 1;
      addWarning(warnings, "存在引用未知用户/套餐的订阅，已跳过");
      return;
    }
    const external = nullableText(field(row, "externalSubscriptionId", "external_subscription_id", "subscriptionId", "subscription_id")) ?? `legacy-subscription-${id}`;
    subscriptions.push({
      sourceId: id,
      userLegacyId: owner,
      planSourceId,
      providerSlug: nullableText(field(row, "paymentProvider", "payment_provider", "provider")) && providerSlug(field(row, "paymentProvider", "payment_provider", "provider"), "legacy"),
      externalSubscriptionId: external.slice(0, 255),
      status: statusFromLegacy(field(row, "status"), "subscription") as PlannedSubscription["status"],
      currentPeriodStart: dateValue(field(row, "startTime", "start_time", "currentPeriodStart", "current_period_start")),
      currentPeriodEnd: dateValue(field(row, "endTime", "end_time", "currentPeriodEnd", "current_period_end")),
      cancelAtPeriodEnd: booleanValue(field(row, "cancelAtPeriodEnd", "cancel_at_period_end")),
      metadata: safeMetadata({ source: textValue(field(row, "source"), "legacy"), amountTotal: field(row, "amountTotal", "amount_total"), amountUsed: field(row, "amountUsed", "amount_used") }),
    });
  });
  entities.subscriptions.planned = subscriptions.length;

  const usage: PlannedUsage[] = [];
  const usageKeys = new Set<string>();
  entities.usage.source = snapshot.logs.length;
  snapshot.logs.forEach((row, index) => {
    const type = integerValue(field(row, "type", "logType", "log_type"), 2);
    const model = textValue(field(row, "modelName", "model_name", "model"));
    const inputTokens = bigintValue(field(row, "promptTokens", "prompt_tokens", "inputTokens", "input_tokens"));
    const outputTokens = bigintValue(field(row, "completionTokens", "completion_tokens", "outputTokens", "output_tokens"));
    if (type !== 2 && !model && inputTokens === BigInt(0) && outputTokens === BigInt(0)) {
      entities.usage.skipped += 1;
      return;
    }
    const owner = userIdFrom(row);
    if (!userIds.has(owner)) {
      entities.usage.skipped += 1;
      addWarning(warnings, "存在引用未知用户的 usage log，已跳过");
      return;
    }
    const costRaw = bigintValue(field(row, "quota", "costQuota", "cost_quota"));
    const cost = costRaw < BigInt(0) ? -costRaw : costRaw;
    const legacyId = nullableText(field(row, "id", "requestId", "request_id")) ?? `row-${index + 1}`;
    const usageKey = `${owner}:${legacyId}`;
    if (usageKeys.has(usageKey)) {
      entities.usage.conflicts += 1;
      addWarning(warnings, "usage log 导出中存在重复 id，重复行已跳过");
      return;
    }
    usageKeys.add(usageKey);
    usage.push({
      sourceId: legacyId,
      userLegacyId: owner,
      tokenLegacyId: integerValue(field(row, "tokenId", "token_id"), 0) || null,
      provider: providerSlug(field(row, "provider", "channelName", "channel_name"), "new-api"),
      model: model.slice(0, 255) || "legacy",
      inputTokens: inputTokens < BigInt(0) ? BigInt(0) : inputTokens,
      outputTokens: outputTokens < BigInt(0) ? BigInt(0) : outputTokens,
      totalTokens: bigintValue(field(row, "totalTokens", "total_tokens"), inputTokens + outputTokens),
      costMicrocredits: cost,
      occurredAt: dateValue(field(row, "createdAt", "created_at")),
      requestId: nullableText(field(row, "requestId", "request_id")),
      metadata: safeMetadata({
        legacyLogId: field(row, "id"),
        type,
        group: field(row, "group"),
        requestSource: field(row, "requestSource", "request_source"),
        // Legacy `other` is free-form operational JSON and can contain
        // upstream diagnostics. Preserve only its existence, never its body.
        legacyOtherPresent: Boolean(field(row, "other")),
      }),
    });
  });
  entities.usage.planned = usage.length;

  const paidTopups = new Map<number, bigint>();
  const payments: PlannedPayment[] = [];
  entities.payments.source = snapshot.topups.length + snapshot.subscriptionOrders.length;
  const paymentReferences = new Set<string>();
  const addPayment = (row: JsonObject, index: number, kind: PlannedPayment["kind"]): void => {
    const id = sourceId(row, index + 1);
    const owner = userIdFrom(row);
    if (!userIds.has(owner)) {
      entities.payments.skipped += 1;
      return;
    }
    const provider = providerSlug(field(row, "paymentProvider", "payment_provider", "provider", "paymentMethod", "payment_method"), "legacy");
    const credits = bigintValue(field(row, "amount", "creditsMicrocredits", "credits_microcredits", "quota"));
    const status = statusFromLegacy(field(row, "status"), "payment") as PlannedPayment["status"];
    const tradeNo = nullableText(field(row, "tradeNo", "trade_no", "orderReference", "order_reference"));
    const orderReference = (tradeNo ?? `legacy-${kind}-${id}`).slice(0, 255);
    if (paymentReferences.has(orderReference)) {
      entities.payments.conflicts += 1;
      addWarning(warnings, "支付记录中存在重复订单号，重复行已跳过");
      return;
    }
    paymentReferences.add(orderReference);
    const payment: PlannedPayment = {
      sourceId: id,
      kind,
      userLegacyId: owner,
      providerSlug: provider,
      subscriptionSourceId: kind === "subscription" ? integerValue(field(row, "userSubscriptionId", "user_subscription_id", "subscriptionInstanceId", "subscription_instance_id"), 0) || null : null,
      orderReference,
      externalReference: nullableText(field(row, "externalReference", "external_reference", "providerReference", "provider_reference")),
      status,
      amountMinor: decimalToMinor(field(row, "money", "priceAmount", "price_amount", "amountMoney", "amount_money")),
      currency: textValue(field(row, "currency"), "USD").toUpperCase().slice(0, 8),
      creditsMicrocredits: credits < BigInt(0) ? BigInt(0) : credits,
      paidAt: dateValue(field(row, "completeTime", "complete_time", "paidAt", "paid_at")),
      createdAt: dateValue(field(row, "createTime", "create_time", "createdAt", "created_at")),
      ledgerCredit: kind === "topup" && status === "paid" && credits > BigInt(0),
      metadata: safeMetadata({ sourceType: kind, paymentMethod: field(row, "paymentMethod", "payment_method") }),
    };
    payments.push(payment);
    if (payment.ledgerCredit) paidTopups.set(owner, (paidTopups.get(owner) ?? BigInt(0)) + credits);
  };
  snapshot.topups.forEach((row, index) => addPayment(row, index, "topup"));
  snapshot.subscriptionOrders.forEach((row, index) => addPayment(row, index, "subscription"));
  entities.payments.planned = payments.length;

  const currentQuotaByUser = new Map<number, bigint>();
  entities.balances.source = users.length;
  for (const row of snapshot.users) {
    const id = sourceId(row, 0);
    if (!userIds.has(id)) continue;
    currentQuotaByUser.set(id, bigintValue(field(row, "quota", "balance", "credits", "credit")));
  }
  const usageByUser = new Map<number, bigint>();
  for (const item of usage) usageByUser.set(item.userLegacyId, (usageByUser.get(item.userLegacyId) ?? BigInt(0)) + item.costMicrocredits);
  const balances: PlannedBalance[] = [];
  let currentTotal = BigInt(0);
  let creditTotal = BigInt(0);
  let debitTotal = BigInt(0);
  let openingTotal = BigInt(0);
  for (const user of users) {
    const current = currentQuotaByUser.get(user.legacyId) ?? BigInt(0);
    const credits = paidTopups.get(user.legacyId) ?? BigInt(0);
    const debits = usageByUser.get(user.legacyId) ?? BigInt(0);
    const opening = current - credits + debits;
    balances.push({ userLegacyId: user.legacyId, currentQuotaMicrocredits: current, openingMicrocredits: opening });
    currentTotal += current;
    creditTotal += credits;
    debitTotal += debits;
    openingTotal += opening;
  }
  entities.balances.planned = balances.length;

  const channels: PlannedChannel[] = [];
  const channelArtifactPayload: JsonObject[] = [];
  entities.channels.source = snapshot.channels.length;
  let plaintextSecretsSeen = 0;
  let ciphertextPreserved = 0;
  snapshot.channels.forEach((row, index) => {
    const id = sourceId(row, index + 1);
    const opaqueCiphertext: JsonObject = {};
    for (const key of ["keyCiphertext", "key_ciphertext", "configurationCiphertext", "configuration_ciphertext", "settingCiphertext", "setting_ciphertext"]) {
      const value = textValue(field(row, key));
      if (value) opaqueCiphertext[key] = value;
    }
    const hasPlaintextSecret = sourceSecretPresent(row);
    if (hasPlaintextSecret) plaintextSecretsSeen += 1;
    if (Object.keys(opaqueCiphertext).length > 0) ciphertextPreserved += 1;
    channels.push({
      sourceId: id,
      name: textValue(field(row, "name"), `Legacy channel ${id}`).slice(0, 120),
      status: statusFromLegacy(field(row, "status"), "channel") as PlannedChannel["status"],
      providerType: textValue(field(row, "type", "provider"), "legacy").slice(0, 80),
      baseUrl: nullableText(field(row, "baseUrl", "base_url")),
      models: listValue(field(row, "models")),
      group: textValue(field(row, "group"), "default").slice(0, 64),
      opaqueCiphertext,
      hasPlaintextSecret,
      raw: row,
    });
    channelArtifactPayload.push({
      legacyId: id,
      name: textValue(field(row, "name"), `Legacy channel ${id}`).slice(0, 120),
      status: statusFromLegacy(field(row, "status"), "channel"),
      providerType: textValue(field(row, "type", "provider"), "legacy").slice(0, 80),
      baseUrl: nullableText(field(row, "baseUrl", "base_url")),
      models: listValue(field(row, "models")),
      group: textValue(field(row, "group"), "default").slice(0, 64),
      raw: row,
    });
  });
  entities.channels.planned = 0;
  entities.channels.skipped = channels.length;
  if (channels.length > 0) {
    addWarning(warnings, "WinLume 当前没有旧 channels 业务表；渠道需通过加密交接产物由 operator 配置");
    if (plaintextSecretsSeen > 0 && !options.apply) addWarning(warnings, "渠道含明文密钥；正式导入必须提供 WINLUME_MIGRATION_CHANNEL_ENCRYPTION_KEY");
  }

  const nonUserRows = snapshot.tokens.length + snapshot.logs.length + snapshot.topups.length + snapshot.subscriptionOrders.length + snapshot.userSubscriptions.length;
  if (snapshot.users.length === 0 && nonUserRows > 0) {
    errors.push("源快照没有 users，但包含引用用户的数据；拒绝正式导入");
    entities.users.errors += 1;
  }
  if (snapshot.users.length > 0 && users.length === 0) {
    errors.push("源快照中的 users 均未通过基本校验；拒绝正式导入");
    entities.users.errors += 1;
  }

  const report: ReconciliationReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    source: { kind: "json", fileProvided: false, rowCounts: countRows(snapshot) },
    entities,
    balances: {
      usersWithBalance: balances.filter((item) => item.currentQuotaMicrocredits !== BigInt(0)).length,
      currentQuotaMicrocredits: currentTotal.toString(),
      historyCreditsMicrocredits: creditTotal.toString(),
      historyDebitsMicrocredits: debitTotal.toString(),
      computedOpeningMicrocredits: openingTotal.toString(),
      targetVerifiedUsers: 0,
      targetMismatchedUsers: 0,
    },
    apiKeys: { rawKeysSeen, hashesAccepted, unavailable: unavailableKeys },
    channels: {
      source: channels.length,
      encryptedArtifactPlanned: channels.length,
      encryptedArtifactWritten: false,
      plaintextSecretsSeen,
      ciphertextPreserved,
      blocked: channels.length,
    },
    warnings,
    errors,
    secretPolicy: {
      reportContainsSecrets: false,
      rawApiKeysImported: false,
      oldSessionsImported: false,
      channelSecrets: "encrypted-artifact-only",
    },
  };

  return { snapshot, users, apiKeys, usage, balances, providers, plans, subscriptions, payments, channels, report, channelArtifactPayload };
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*(?:\.[a-zA-Z_][a-zA-Z0-9_$]*)?$/.test(identifier)) throw new Error("unsupported SQL identifier");
  return identifier.split(".").map((part) => `"${part.replaceAll('"', '""')}"`).join(".");
}

async function tableExists(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query<{ name: string | null }>("SELECT to_regclass($1) AS name", [tableName]);
  return Boolean(result.rows[0]?.name);
}

async function readSourceTable(client: PoolClient, tableName: string, maxRows: number | null): Promise<JsonObject[]> {
  if (!SUPPORTED_SOURCE_TABLES.has(tableName.toLowerCase())) return [];
  if (!(await tableExists(client, tableName))) return [];
  const limit = maxRows && maxRows > 0 ? ` LIMIT ${Math.floor(maxRows)}` : "";
  const result = await client.query(`SELECT * FROM ${quoteIdentifier(tableName)}${limit}`);
  return result.rows.map(asObject);
}

async function readFirstSourceTable(client: PoolClient, tableNames: string[], maxRows: number | null): Promise<JsonObject[]> {
  for (const tableName of tableNames) {
    const rows = await readSourceTable(client, tableName, maxRows);
    if (rows.length > 0 || (await tableExists(client, tableName))) return rows;
  }
  return [];
}

/** Read the known New API tables without interpolating user supplied identifiers. */
export async function snapshotFromPostgres(databaseUrl: string, options: Pick<MigrationOptions, "maxRows" | "sourceLogDatabaseUrl"> = { maxRows: null }): Promise<LegacySnapshot> {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const logPool = options.sourceLogDatabaseUrl ? new Pool({ connectionString: options.sourceLogDatabaseUrl, max: 2 }) : pool;
  const result: LegacySnapshot = { version: 1, source: { kind: "postgres" } };
  try {
    const client = await pool.connect();
    try {
      const [users, tokens, topups, subscriptionPlans, subscriptionOrders, userSubscriptions, paymentProviders, channels] = await Promise.all([
        readSourceTable(client, "users", options.maxRows),
        readSourceTable(client, "tokens", options.maxRows),
        readFirstSourceTable(client, ["top_ups", "topups", "top_up"], options.maxRows),
        readSourceTable(client, "subscription_plans", options.maxRows),
        readSourceTable(client, "subscription_orders", options.maxRows),
        readSourceTable(client, "user_subscriptions", options.maxRows),
        readSourceTable(client, "payment_providers", options.maxRows),
        readSourceTable(client, "channels", options.maxRows),
      ]);
      result.users = users;
      result.tokens = tokens;
      result.topups = topups;
      result.subscriptionPlans = subscriptionPlans;
      result.subscriptionOrders = subscriptionOrders;
      result.userSubscriptions = userSubscriptions;
      result.paymentProviders = paymentProviders;
      result.channels = channels;
    } finally {
      client.release();
    }
    const logClient = await logPool.connect();
    try {
      result.logs = await readSourceTable(logClient, "logs", options.maxRows);
    } finally {
      logClient.release();
    }
  } finally {
    if (logPool !== pool) await logPool.end();
    await pool.end();
  }
  return result;
}

function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "single" | "double" | "lineComment" | "blockComment" | null = null;
  let dollarTag: string | null = null;
  let blockDepth = 0;
  for (let i = 0; i < sqlText.length; i += 1) {
    const char = sqlText[i];
    const next = sqlText[i + 1];
    if (dollarTag) {
      if (sqlText.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote === "lineComment") {
      if (char === "\n") quote = null;
      continue;
    }
    if (quote === "blockComment") {
      if (char === "/" && next === "*") {
        blockDepth += 1;
        i += 1;
      } else if (char === "*" && next === "/") {
        blockDepth -= 1;
        i += 1;
        if (blockDepth === 0) quote = null;
      }
      continue;
    }
    if (quote === "single") {
      if (char === "'" && next === "'") i += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (quote === "double") {
      if (char === '"' && next === '"') i += 1;
      else if (char === '"') quote = null;
      continue;
    }
    if (char === "-" && next === "-") {
      quote = "lineComment";
      i += 1;
    } else if (char === "/" && next === "*") {
      quote = "blockComment";
      blockDepth = 1;
      i += 1;
    } else if (char === "'") quote = "single";
    else if (char === '"') quote = "double";
    else if (char === "$" && /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/.test(sqlText.slice(i))) {
      const match = sqlText.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length - 1;
      }
    } else if (char === ";") {
      const statement = sqlText.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = sqlText.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function splitSqlCsv(value: string): string[] {
  const fields: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "single" | "double" | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];
    if (quote === "single") {
      if (char === "'" && next === "'") i += 1;
      else if (char === "'") quote = null;
    } else if (quote === "double") {
      if (char === '"' && next === '"') i += 1;
      else if (char === '"') quote = null;
    } else if (char === "'") quote = "single";
    else if (char === '"') quote = "double";
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      fields.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  fields.push(value.slice(start).trim());
  return fields;
}

function parseSqlLiteral(value: string): unknown {
  let text = value.trim();
  text = text.replace(/::[a-zA-Z_][a-zA-Z0-9_.]*/g, "").trim();
  if (/^null$/i.test(text)) return null;
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text.includes(".") ? Number(text) : text;
  if ((text.startsWith("'") && text.endsWith("'")) || (/^e'/i.test(text) && text.endsWith("'"))) {
    const body = /^e'/i.test(text) ? text.slice(2, -1) : text.slice(1, -1);
    return body.replace(/''/g, "'").replace(/\\([\\'])/g, "$1");
  }
  if (text.startsWith("(") && text.endsWith(")")) return splitSqlCsv(text.slice(1, -1)).map(parseSqlLiteral);
  return text;
}

function parseSqlInsert(statement: string): { table: string; columns: string[]; rows: JsonObject[] } | null {
  const match = statement.match(/^\s*INSERT\s+INTO\s+(?:(?:"?public"?)\.)?"?([a-zA-Z_][a-zA-Z0-9_$]*)"?\s*\(([^)]*)\)\s+VALUES\s+([\s\S]*)$/i);
  if (!match) return null;
  const table = match[1].toLowerCase();
  if (!SUPPORTED_SOURCE_TABLES.has(table)) return null;
  const columns = splitSqlCsv(match[2]).map((column) => column.replace(/^"|"$/g, "").trim());
  const valuesText = match[3].trim();
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  let quote: "single" | "double" | null = null;
  for (let i = 0; i < valuesText.length; i += 1) {
    const char = valuesText[i];
    const next = valuesText[i + 1];
    if (quote === "single") {
      if (char === "'" && next === "'") i += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (quote === "double") {
      if (char === '"' && next === '"') i += 1;
      else if (char === '"') quote = null;
      continue;
    }
    if (char === "'") quote = "single";
    else if (char === '"') quote = "double";
    else if (char === "(") {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        groups.push(valuesText.slice(start, i));
        start = -1;
      }
    }
  }
  return {
    table,
    columns,
    rows: groups.map((group) => {
      const values = splitSqlCsv(group).map(parseSqlLiteral);
      return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    }),
  };
}

/** Parse only INSERT statements with explicit column lists from a pg_dump snapshot. */
export function parseSqlSnapshot(sqlText: string): LegacySnapshot {
  const tables: JsonObject = {};
  let supportedStatements = 0;
  for (const statement of splitSqlStatements(sqlText)) {
    const parsed = parseSqlInsert(statement);
    if (!parsed) continue;
    supportedStatements += 1;
    const existing = Array.isArray(tables[parsed.table]) ? (tables[parsed.table] as unknown[]) : [];
    tables[parsed.table] = [...existing, ...parsed.rows];
  }
  if (supportedStatements === 0) throw new Error("SQL 快照必须包含带列名的 INSERT 语句；不支持直接执行任意 SQL");
  return { version: 1, source: { kind: "sql" }, tables };
}

export async function loadSnapshotFromFile(filePath: string): Promise<LegacySnapshot> {
  const contents = await readFile(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".sql")) return parseSqlSnapshot(contents);
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new Error("迁移源文件不是有效 JSON；SQL 快照请使用 .sql 扩展名");
  }
  const snapshot = asObject(parsed) as LegacySnapshot;
  return snapshot;
}

function reportSafe(report: ReconciliationReport): string {
  const encoded = JSON.stringify(report, null, 2);
  if (/\$2[aby]\$\d{2}\$/.test(encoded)) {
    throw new Error("internal safety check failed: report contains a sensitive-looking value");
  }
  return encoded;
}

function deriveEncryptionKey(input: string): Buffer {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("channel encryption key is empty");
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to a deterministic KDF for operator-provided passphrases.
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptChannelArtifact(payload: JsonObject[], encryptionKey: string): JsonObject {
  const key = deriveEncryptionKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    keyId: createHash("sha256").update(key).digest("hex").slice(0, 16),
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

function parseArgs(argv: string[], env: NodeJS.ProcessEnv): MigrationOptions {
  const getArg = (name: string): string | undefined => {
    const prefix = `${name}=`;
    const value = argv.find((arg) => arg.startsWith(prefix));
    return value ? value.slice(prefix.length) : undefined;
  };
  const applyFlag = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  return {
    apply: applyFlag && !dryRun,
    sourceFile: getArg("--source-file") ?? env.NEW_API_MIGRATION_SOURCE_FILE,
    sourceDatabaseUrl: getArg("--source-url") ?? env.NEW_API_MIGRATION_SOURCE_DATABASE_URL,
    targetDatabaseUrl: getArg("--target-url") ?? env.DATABASE_URL,
    reportFile: getArg("--report") ?? env.NEW_API_MIGRATION_REPORT_FILE,
    snapshotOut: getArg("--snapshot-out") ?? env.NEW_API_MIGRATION_SNAPSHOT_OUT,
    channelArtifactFile: getArg("--channel-artifact") ?? env.NEW_API_MIGRATION_CHANNEL_ARTIFACT_FILE,
    channelEncryptionKey: env.WINLUME_MIGRATION_CHANNEL_ENCRYPTION_KEY,
    sourceLogDatabaseUrl: env.NEW_API_MIGRATION_SOURCE_LOG_DATABASE_URL,
    preserveCiphertext: env.NEW_API_MIGRATION_PRESERVE_CIPHERTEXT !== "0",
    maxRows: getArg("--max-rows") ? Math.max(1, integerValue(getArg("--max-rows"), 1)) : null,
  };
}

async function importPlan(plan: MigrationPlan, options: MigrationOptions): Promise<void> {
  if (!options.targetDatabaseUrl) throw new Error("正式导入需要 DATABASE_URL 或 --target-url");
  const pool = new Pool({ connectionString: options.targetDatabaseUrl, max: 2 });
  const client = await pool.connect();
  const context: ApplyContext = { users: new Map(), keys: new Map(), providers: new Map(), plans: new Map(), subscriptions: new Map(), wallets: new Map() };
  try {
    await client.query("BEGIN");
    for (const user of plan.users) {
      const existing = await client.query<{ id: string; legacy_new_api_user_id: number | null }>("SELECT id,legacy_new_api_user_id FROM users WHERE legacy_new_api_user_id = $1 OR username = $2 OR ($3::text IS NOT NULL AND email = $3) ORDER BY legacy_new_api_user_id NULLS LAST LIMIT 1", [user.legacyId, user.username, user.email]);
      let id = existing.rows[0]?.id;
      if (id && existing.rows[0]?.legacy_new_api_user_id !== null && existing.rows[0]?.legacy_new_api_user_id !== user.legacyId) {
        plan.report.entities.users.conflicts += 1;
        plan.report.entities.users.skipped += 1;
        continue;
      }
      if (id) {
        const passwordClause = user.passwordHash
          ? ", password_hash = CASE WHEN users.password_hash IS DISTINCT FROM $7 THEN $7 ELSE users.password_hash END, auth_version = CASE WHEN users.password_hash IS DISTINCT FROM $7 THEN users.auth_version + 1 ELSE users.auth_version END"
          : "";
        const legacyPosition = user.passwordHash ? 8 : 7;
        const idPosition = legacyPosition + 1;
        const params: unknown[] = [
          user.username,
          user.displayName,
          user.email,
          user.status,
          user.platformRole,
          user.lastLoginAt,
          ...(user.passwordHash ? [user.passwordHash] : []),
          user.legacyId,
          id,
        ];
        await client.query(
          `UPDATE users SET username = $1, display_name = $2, email = $3, status = $4, platform_role = $5, last_login_at = $6${passwordClause}, legacy_new_api_user_id = COALESCE(legacy_new_api_user_id, $${legacyPosition}) WHERE id = $${idPosition}`,
          params,
        );
      } else {
        const inserted = await client.query<{ id: string }>("INSERT INTO users (legacy_new_api_user_id, username, email, display_name, password_hash, status, platform_role, last_login_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()),now()) RETURNING id", [user.legacyId, user.username, user.email, user.displayName, user.passwordHash, user.status, user.platformRole, user.lastLoginAt, user.createdAt]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("user import returned no id");
      context.users.set(user.legacyId, id);
      plan.report.entities.users.imported += 1;
    }

    for (const provider of plan.providers) {
      const existing = await client.query<{ id: string }>("SELECT id FROM payment_providers WHERE slug = $1 LIMIT 1", [provider.slug]);
      let id = existing.rows[0]?.id;
      if (id) {
        await client.query("UPDATE payment_providers SET name=$1,status=$2,configuration_ciphertext=COALESCE($3,configuration_ciphertext),webhook_secret_ciphertext=COALESCE($4,webhook_secret_ciphertext),supported_currencies=$5,updated_at=now() WHERE id=$6", [provider.name, provider.status, provider.configurationCiphertext, provider.webhookSecretCiphertext, provider.supportedCurrencies, id]);
      } else {
        const inserted = await client.query<{ id: string }>("INSERT INTO payment_providers (slug,name,status,configuration_ciphertext,webhook_secret_ciphertext,supported_currencies) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [provider.slug, provider.name, provider.status, provider.configurationCiphertext, provider.webhookSecretCiphertext, provider.supportedCurrencies]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("payment provider import returned no id");
      context.providers.set(provider.slug, id);
      plan.report.entities.providers.imported += 1;
    }

    for (const item of plan.plans) {
      const existing = await client.query<{ id: string }>("SELECT id FROM subscription_plans WHERE code=$1 LIMIT 1", [item.code]);
      let id = existing.rows[0]?.id;
      if (id) {
        await client.query("UPDATE subscription_plans SET name=$1,interval=$2,price_minor=$3,currency=$4,entitlements=$5,active=$6,updated_at=now() WHERE id=$7", [item.name, item.interval, item.priceMinor.toString(), item.currency, item.entitlements, item.active, id]);
      } else {
        const inserted = await client.query<{ id: string }>("INSERT INTO subscription_plans (code,name,interval,price_minor,currency,entitlements,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", [item.code, item.name, item.interval, item.priceMinor.toString(), item.currency, item.entitlements, item.active]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("subscription plan import returned no id");
      context.plans.set(item.sourceId, id);
      plan.report.entities.plans.imported += 1;
    }

    for (const item of plan.subscriptions) {
      const userId = context.users.get(item.userLegacyId);
      const planId = context.plans.get(item.planSourceId);
      const providerId = item.providerSlug ? context.providers.get(item.providerSlug) ?? null : null;
      if (!userId || !planId) {
        plan.report.entities.subscriptions.skipped += 1;
        continue;
      }
      const existing = await client.query<{ id: string; user_id: string }>("SELECT id,user_id FROM subscriptions WHERE external_subscription_id=$1 AND ($2::uuid IS NULL OR payment_provider_id=$2) LIMIT 1", [item.externalSubscriptionId, providerId]);
      let id = existing.rows[0]?.id;
      if (id && existing.rows[0]?.user_id !== userId) {
        plan.report.entities.subscriptions.conflicts += 1;
        plan.report.entities.subscriptions.skipped += 1;
        continue;
      }
      if (id) {
        await client.query("UPDATE subscriptions SET user_id=$1,plan_id=$2,payment_provider_id=$3,status=$4,current_period_start=$5,current_period_end=$6,cancel_at_period_end=$7,metadata=$8,updated_at=now() WHERE id=$9", [userId, planId, providerId, item.status, item.currentPeriodStart, item.currentPeriodEnd, item.cancelAtPeriodEnd, item.metadata, id]);
      } else {
        const inserted = await client.query<{ id: string }>("INSERT INTO subscriptions (user_id,plan_id,payment_provider_id,external_subscription_id,status,current_period_start,current_period_end,cancel_at_period_end,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [userId, planId, providerId, item.externalSubscriptionId, item.status, item.currentPeriodStart, item.currentPeriodEnd, item.cancelAtPeriodEnd, item.metadata]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("subscription import returned no id");
      context.subscriptions.set(item.sourceId, id);
      plan.report.entities.subscriptions.imported += 1;
    }

    for (const item of plan.payments) {
      const userId = context.users.get(item.userLegacyId);
      const providerId = context.providers.get(item.providerSlug);
      if (!userId || !providerId) {
        plan.report.entities.payments.skipped += 1;
        continue;
      }
      const subscriptionId = item.subscriptionSourceId ? context.subscriptions.get(item.subscriptionSourceId) ?? null : null;
      const existing = await client.query<{ id: string; user_id: string }>("SELECT id,user_id FROM payment_orders WHERE order_reference=$1 LIMIT 1", [item.orderReference]);
      let id = existing.rows[0]?.id;
      if (id && existing.rows[0]?.user_id !== userId) {
        plan.report.entities.payments.conflicts += 1;
        plan.report.entities.payments.skipped += 1;
        continue;
      }
      if (id) {
        await client.query("UPDATE payment_orders SET user_id=$1,payment_provider_id=$2,subscription_id=$3,status=CASE WHEN payment_orders.status='paid' THEN payment_orders.status ELSE $4 END,amount_minor=$5,currency=$6,credits_microcredits=$7,metadata=$8,paid_at=COALESCE($9,payment_orders.paid_at),updated_at=now() WHERE id=$10", [userId, providerId, subscriptionId, item.status, item.amountMinor.toString(), item.currency, item.creditsMicrocredits.toString(), item.metadata, item.paidAt, id]);
      } else {
        const inserted = await client.query<{ id: string }>("INSERT INTO payment_orders (user_id,payment_provider_id,subscription_id,order_reference,external_reference,status,amount_minor,currency,credits_microcredits,idempotency_key,metadata,paid_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,now()),now()) RETURNING id", [userId, providerId, subscriptionId, item.orderReference, item.externalReference, item.status, item.amountMinor.toString(), item.currency, item.creditsMicrocredits.toString(), `legacy:${item.kind}:${item.sourceId}`, item.metadata, item.paidAt, item.createdAt]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("payment order import returned no id");
      plan.report.entities.payments.imported += 1;
    }

    for (const user of plan.users) {
      const targetUserId = context.users.get(user.legacyId);
      if (!targetUserId) continue;
      const walletResult = await client.query<{ id: string }>("INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at=wallets.updated_at RETURNING id", [targetUserId]);
      const walletId = walletResult.rows[0]?.id ?? (await client.query<{ id: string }>("SELECT id FROM wallets WHERE user_id=$1", [targetUserId])).rows[0]?.id;
      if (!walletId) throw new Error("wallet import returned no id");
      context.wallets.set(user.legacyId, walletId);
    }

    for (const item of plan.apiKeys) {
      const userId = context.users.get(item.userLegacyId);
      if (!userId) continue;
      const existing = await client.query<{ id: string; user_id: string }>("SELECT id,user_id FROM api_keys WHERE key_hash=$1 LIMIT 1", [item.keyHash]);
      let id = existing.rows[0]?.id;
      if (id && existing.rows[0]?.user_id !== userId) {
        plan.report.entities.apiKeys.conflicts += 1;
        plan.report.entities.apiKeys.skipped += 1;
        continue;
      }
      if (id) {
        await client.query("UPDATE api_keys SET user_id=$1,name=COALESCE(NULLIF(name,''),$2),key_prefix=$3,status=$4,scopes=$5,allowed_models=$6,allowed_groups=$7,ip_allowlist=$8,quota_limit_microcredits=$9,expires_at=$10,last_used_at=$11,updated_at=now() WHERE id=$12", [userId, `Legacy token ${item.legacyId}`, item.keyPrefix, item.status, item.scopes, item.allowedModels, item.allowedGroups, item.ipAllowlist, item.quotaLimitMicrocredits?.toString() ?? null, item.expiresAt, item.lastUsedAt, id]);
      } else {
        const inserted = await client.query<{ id: string }>("INSERT INTO api_keys (user_id,name,key_prefix,key_hash,status,scopes,allowed_models,allowed_groups,ip_allowlist,quota_limit_microcredits,expires_at,last_used_at,metadata,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14,now()),now()) RETURNING id", [userId, `Legacy token ${item.legacyId}`, item.keyPrefix, item.keyHash, item.status, item.scopes, item.allowedModels, item.allowedGroups, item.ipAllowlist, item.quotaLimitMicrocredits?.toString() ?? null, item.expiresAt, item.lastUsedAt, { legacyTokenId: item.legacyId }, item.createdAt]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("API key import returned no id");
      context.keys.set(item.legacyId, id);
      plan.report.entities.apiKeys.imported += 1;
    }

    for (const item of plan.usage) {
      const userId = context.users.get(item.userLegacyId);
      if (!userId) continue;
      const apiKeyId = item.tokenLegacyId ? context.keys.get(item.tokenLegacyId) ?? null : null;
      const idempotencyKey = `legacy:usage:${item.sourceId}`.slice(0, 255);
      const existing = await client.query<{ id: string }>("SELECT id FROM usage_events WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1", [userId, idempotencyKey]);
      let id = existing.rows[0]?.id;
      if (!id) {
        const inserted = await client.query<{ id: string }>("INSERT INTO usage_events (user_id,api_key_id,idempotency_key,request_id,provider,model,input_tokens,output_tokens,total_tokens,cost_microcredits,status,metadata,occurred_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'settled',$11,COALESCE($12,now()),COALESCE($12,now()),now()) RETURNING id", [userId, apiKeyId, idempotencyKey, item.requestId, item.provider, item.model, item.inputTokens.toString(), item.outputTokens.toString(), item.totalTokens.toString(), item.costMicrocredits.toString(), item.metadata, item.occurredAt]);
        id = inserted.rows[0]?.id;
      }
      if (!id) throw new Error("usage event import returned no id");
      if (item.costMicrocredits > BigInt(0)) {
        const walletId = context.wallets.get(item.userLegacyId);
        if (!walletId) throw new Error("usage import could not resolve wallet");
        await client.query("INSERT INTO wallet_ledger_entries (wallet_id,usage_event_id,entry_type,amount_microcredits,idempotency_key,reference,metadata,created_at) VALUES ($1,$2,'debit',$3,$4,$5,$6,COALESCE($7,now())) ON CONFLICT (wallet_id,idempotency_key) DO NOTHING", [walletId, id, (-item.costMicrocredits).toString(), `legacy:usage:${item.sourceId}`.slice(0, 255), item.requestId ?? item.sourceId, item.metadata, item.occurredAt]);
      }
      plan.report.entities.usage.imported += 1;
    }

    for (const payment of plan.payments.filter((item) => item.ledgerCredit)) {
      const walletId = context.wallets.get(payment.userLegacyId);
      if (!walletId) continue;
      await client.query("INSERT INTO wallet_ledger_entries (wallet_id,entry_type,amount_microcredits,idempotency_key,reference,metadata,created_at) VALUES ($1,'credit',$2,$3,$4,$5,COALESCE($6,now())) ON CONFLICT (wallet_id,idempotency_key) DO NOTHING", [walletId, payment.creditsMicrocredits.toString(), `legacy:topup:${payment.sourceId}`.slice(0, 255), payment.orderReference, payment.metadata, payment.paidAt ?? payment.createdAt]);
    }

    for (const balance of plan.balances) {
      const walletId = context.wallets.get(balance.userLegacyId);
      if (!walletId || balance.openingMicrocredits === BigInt(0)) continue;
      await client.query("INSERT INTO wallet_ledger_entries (wallet_id,entry_type,amount_microcredits,idempotency_key,reference,metadata) VALUES ($1,'opening_balance',$2,$3,$4,$5) ON CONFLICT (wallet_id,idempotency_key) DO NOTHING", [walletId, balance.openingMicrocredits.toString(), `legacy:opening:${balance.userLegacyId}`.slice(0, 255), "new-api migration opening balance", { source: "new-api", legacyUserId: balance.userLegacyId }]);
      plan.report.entities.balances.imported += 1;
    }

    let verifiedWallets = 0;
    let mismatchedWallets = 0;
    for (const balance of plan.balances) {
      const walletId = context.wallets.get(balance.userLegacyId);
      if (!walletId) continue;
      const result = await client.query<{ balance: string }>("SELECT COALESCE(SUM(amount_microcredits), 0)::text AS balance FROM wallet_ledger_entries WHERE wallet_id=$1", [walletId]);
      const actual = bigintValue(result.rows[0]?.balance);
      if (actual === balance.currentQuotaMicrocredits) verifiedWallets += 1;
      else mismatchedWallets += 1;
    }
    plan.report.balances.targetVerifiedUsers = verifiedWallets;
    plan.report.balances.targetMismatchedUsers = mismatchedWallets;
    if (mismatchedWallets > 0) addWarning(plan.report.warnings, "部分目标钱包余额与旧 quota 不一致；请根据 reconciliation 报告在切流前核对");

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error(safeError(error));
  } finally {
    client.release();
    await pool.end();
  }
}

async function runCli(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);
  if (!options.sourceFile && !options.sourceDatabaseUrl) throw new Error("请提供 --source-file 或 NEW_API_MIGRATION_SOURCE_DATABASE_URL");
  const sourceKind: "json" | "postgres" | "sql" = options.sourceDatabaseUrl ? "postgres" : options.sourceFile?.toLowerCase().endsWith(".sql") ? "sql" : "json";
  const rawSnapshot = options.sourceDatabaseUrl
    ? await snapshotFromPostgres(options.sourceDatabaseUrl, { maxRows: options.maxRows, sourceLogDatabaseUrl: options.sourceLogDatabaseUrl })
    : await loadSnapshotFromFile(resolve(options.sourceFile as string));
  if (options.snapshotOut) {
    // Snapshot export is explicit and local; it is never printed. Operators
    // should protect this file like the source database because it can contain
    // bcrypt hashes and legacy token material.
    await writeFile(resolve(options.snapshotOut), `${JSON.stringify(rawSnapshot, null, 2)}\n`, { mode: 0o600 });
  }
  const plan = buildMigrationPlan(rawSnapshot, { apply: options.apply, preserveCiphertext: options.preserveCiphertext });
  plan.report.source.kind = sourceKind;
  plan.report.source.fileProvided = Boolean(options.sourceFile);
  if (plan.channels.length > 0 && options.apply) {
    if (!options.channelArtifactFile) {
      plan.report.channels.blocked = plan.channels.length;
      plan.report.errors.push("存在渠道配置但未提供 --channel-artifact；当前目标需通过加密交接产物配置渠道");
    } else if (!options.channelEncryptionKey) {
      plan.report.channels.blocked = plan.channels.length;
      plan.report.errors.push("存在渠道明文/密文配置但未提供 WINLUME_MIGRATION_CHANNEL_ENCRYPTION_KEY");
    }
  }
  const emitReport = async (): Promise<void> => {
    const output = reportSafe(plan.report);
    if (options.reportFile) {
      await writeFile(resolve(options.reportFile), `${output}\n`, { mode: 0o600 });
    }
    process.stdout.write(`${output}\n`);
  };
  if (options.apply && plan.report.errors.length > 0) {
    await emitReport();
    throw new Error("校验未通过；请先执行 dry-run 并处理报告中的 errors");
  }
  if (options.apply) {
    try {
      await importPlan(plan, options);
    } catch (error) {
      plan.report.errors.push("目标数据库事务未完成，所有本次数据库写入已回滚");
      await emitReport();
      throw error;
    }
    if (plan.channels.length > 0 && options.channelArtifactFile && options.channelEncryptionKey) {
      const artifact = encryptChannelArtifact(plan.channelArtifactPayload, options.channelEncryptionKey);
      await writeFile(resolve(options.channelArtifactFile), `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
      plan.report.channels.encryptedArtifactWritten = true;
      plan.report.channels.blocked = 0;
    }
  }
  await emitReport();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli().catch((error: unknown) => {
    // Never print an untrusted database/provider error verbatim.
    process.stderr.write(`new-api migration failed: ${safeError(error)}\n`);
    process.exitCode = 1;
  });
}
