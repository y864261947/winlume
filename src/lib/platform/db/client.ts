import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseConfig } from "./config";
import * as schema from "./schema";

export type PlatformDatabase = NodePgDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is required for WinLume platform data access.");
    this.name = "DatabaseNotConfiguredError";
  }
}

type DatabaseGlobal = {
  winlumePlatformDb?: PlatformDatabase;
  winlumePlatformPool?: Pool;
};

const databaseConfig = getDatabaseConfig();
const databaseGlobal = globalThis as typeof globalThis & DatabaseGlobal;

function createDatabase(): PlatformDatabase | null {
  if (!databaseConfig.url) return null;

  if (!databaseGlobal.winlumePlatformPool) {
    databaseGlobal.winlumePlatformPool = new Pool({ connectionString: databaseConfig.url });
  }
  if (!databaseGlobal.winlumePlatformDb) {
    databaseGlobal.winlumePlatformDb = drizzle({
      client: databaseGlobal.winlumePlatformPool,
      schema,
    });
  }
  return databaseGlobal.winlumePlatformDb;
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
