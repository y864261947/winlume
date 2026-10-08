import type { Session } from "@/lib/agent/types";

/** Session records carry no run state; filtering must not invent status or progress. */
export function filterTaskRecords(sessions: Session[], query: string, days: number | null, asOf: number): Session[] {
  const cutoff = days === null ? -Infinity : asOf - days * 86400000;
  const search = query.trim().toLowerCase();
  return sessions.filter(session => (days === null || new Date(session.updatedAt).getTime() >= cutoff)
    && `${session.title} ${session.model}`.toLowerCase().includes(search))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
