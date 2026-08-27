import { desc, eq } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { feedbackReports, users } from "../db/schema";

export type FeedbackType = "bug" | "feature";
export type FeedbackStatus = "open" | "resolved";

export type FeedbackReport = typeof feedbackReports.$inferSelect;
export type FeedbackReportWithUser = FeedbackReport & {
  userDisplayName: string | null;
  userEmail: string | null;
};

export class FeedbackRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async create(input: {
    userId: string;
    type: FeedbackType;
    description: string;
    screenshots: string[];
  }): Promise<FeedbackReport> {
    const [row] = await this.database
      .insert(feedbackReports)
      .values({
        userId: input.userId,
        type: input.type,
        description: input.description,
        screenshots: input.screenshots,
      })
      .returning();
    return row;
  }

  async listByUser(userId: string): Promise<FeedbackReport[]> {
    return this.database
      .select()
      .from(feedbackReports)
      .where(eq(feedbackReports.userId, userId))
      .orderBy(desc(feedbackReports.createdAt));
  }

  async listAll(): Promise<FeedbackReportWithUser[]> {
    const rows = await this.database
      .select({
        report: feedbackReports,
        userDisplayName: users.displayName,
        userEmail: users.email,
      })
      .from(feedbackReports)
      .leftJoin(users, eq(feedbackReports.userId, users.id))
      .orderBy(desc(feedbackReports.createdAt));
    return rows.map(({ report, userDisplayName, userEmail }) => ({
      ...report,
      userDisplayName,
      userEmail,
    }));
  }

  async updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackReport | null> {
    const [row] = await this.database
      .update(feedbackReports)
      .set({ status, updatedAt: new Date() })
      .where(eq(feedbackReports.id, id))
      .returning();
    return row ?? null;
  }
}
