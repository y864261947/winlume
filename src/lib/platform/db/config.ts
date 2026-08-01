export interface DatabaseConfig {
  url: string | null;
  isConfigured: boolean;
}

export function getDatabaseConfig(env: Readonly<Record<string, string | undefined>> = process.env): DatabaseConfig {
  const url = env.DATABASE_URL?.trim() || null;
  return { url, isConfigured: url !== null };
}
