import { eq } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { portalContentSettings } from "../db/schema";

export class PortalContentRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async get(key: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.database.select().from(portalContentSettings).where(eq(portalContentSettings.key, key)).limit(1);
    return row?.value ?? null;
  }

  async set(key: string, value: Record<string, unknown>) {
    const [row] = await this.database
      .insert(portalContentSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: portalContentSettings.key, set: { value, updatedAt: new Date() } })
      .returning();
    return row;
  }
}
