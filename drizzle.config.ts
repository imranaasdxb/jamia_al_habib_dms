import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const migrationUrl = process.env.DATABASE_URL_UNPOOLED;
if (!migrationUrl) throw new Error("DATABASE_URL_UNPOOLED is required for migrations.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: migrationUrl },
  schemaFilter: ["public"],
  strict: true,
});
