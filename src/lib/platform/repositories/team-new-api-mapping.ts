import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { teamNewApiMapping } from "../db/schema";

export type TeamNewApiMappingRecord = InferSelectModel<typeof teamNewApiMapping>;

export interface CreateTeamNewApiMappingInput {
  organizationId: string;
  newApiUserId: number;
  newApiUsername: string;
  newApiPasswordCiphertext: string;
  newApiPatCiphertext: string;
}

type Transaction = Pick<PlatformDatabase, "insert">;

export class TeamNewApiMappingRepository {
  constructor(private readonly database?: PlatformDatabase) {}

  async create(tx: Transaction, input: CreateTeamNewApiMappingInput): Promise<TeamNewApiMappingRecord> {
    const [record] = await tx
      .insert(teamNewApiMapping)
      .values({
        organizationId: input.organizationId,
        newApiUserId: input.newApiUserId,
        newApiUsername: input.newApiUsername,
        newApiPasswordCiphertext: input.newApiPasswordCiphertext,
        newApiPatCiphertext: input.newApiPatCiphertext,
      })
      .returning();
    if (!record) throw new Error("Failed to create team/new-api mapping.");
    return record;
  }

  async findByOrganizationId(organizationId: string): Promise<TeamNewApiMappingRecord | null> {
    if (!this.database) throw new Error("TeamNewApiMappingRepository was constructed without a database.");
    const [record] = await this.database
      .select()
      .from(teamNewApiMapping)
      .where(eq(teamNewApiMapping.organizationId, organizationId))
      .limit(1);
    return record ?? null;
  }
}
