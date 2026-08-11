import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseConfig } from "./config";
import * as schema from "./schema";

export type PlatformDatabase = NodePgDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is required for Reizo platform data access.");
    this.name = "DatabaseNotConfiguredError";
  }
}

type DatabaseGlobal = {
  reizoPlatformDb?: PlatformDatabase;
  reizoPlatformPool?: Pool;
};

const databaseConfig = getDatabaseConfig();
const databaseGlobal = globalThis as typeof globalThis & DatabaseGlobal;

function createDatabase(): PlatformDatabase | null {
  if (!databaseConfig.url) return null;

  if (!databaseGlobal.reizoPlatformPool) {
    databaseGlobal.reizoPlatformPool = new Pool({ connectionString: databaseConfig.url });
  }
  if (!databaseGlobal.reizoPlatformDb) {
    databaseGlobal.reizoPlatformDb = drizzle({
      client: databaseGlobal.reizoPlatformPool,
      schema,
    });
  }
  return databaseGlobal.reizoPlatformDb;
}

const platformDb = createDatabase();

export function isPlatformDatabaseConfigured(): boolean {
  return platformDb !== null;
}

export function getPlatformDb(): PlatformDatabase | null {
  return platformDb;
}

export function requirePlatformDb(): PlatformDatabase {
  if (!platformDb) throw new DatabaseNotConfiguredError();
  return platformDb;
}
