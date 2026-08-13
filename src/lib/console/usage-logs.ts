import { DEFAULT_QUOTA_PER_UNIT } from "@/lib/catalog/plaza-display";
import type { NewApiUserLog } from "@/lib/newapi/team-client";
import type { ConsoleUsageLog, ConsoleUsageLogType } from "./types";

const PUBLIC_LOG_TYPES: Record<number, ConsoleUsageLogType> = {
  2: "consume",
  5: "error",
};

export function mapUsageLog(row: NewApiUserLog, index: number): ConsoleUsageLog {
  const type = PUBLIC_LOG_TYPES[row.type ?? 0] ?? "other";
  const createdAtSeconds = typeof row.created_at === "number" ? row.created_at : 0;
  const requestId = row.request_id?.trim() || null;
  return {
    id: requestId || `${createdAtSeconds}-${row.token_name ?? ""}-${row.model_name ?? ""}-${index}`,
    createdAt: createdAtSeconds > 0 ? new Date(createdAtSeconds * 1000).toISOString() : "",
    type,
    model: row.model_name ?? "",
    tokenName: row.token_name ?? "",
    promptTokens: row.prompt_tokens ?? 0,
    completionTokens: row.completion_tokens ?? 0,
    durationSeconds: row.use_time ?? 0,
    streamed: Boolean(row.is_stream),
    credits: (row.quota ?? 0) / DEFAULT_QUOTA_PER_UNIT,
    requestId,
    content: type === "error" ? (row.content ?? null) : null,
  };
}
