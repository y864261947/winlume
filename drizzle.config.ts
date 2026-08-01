import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/platform/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Generation does not need a live database; migration commands should fail
    // clearly when DATABASE_URL has not been supplied by the environment.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
