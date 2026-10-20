import "server-only";
import { z } from "zod";

const serverEnvironment = z.object({
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgresql://")
    || value.startsWith("postgres://")),
  NEON_AUTH_BASE_URL: z.url().refine((value) => value.startsWith("https://")),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32),
});

let cachedEnvironment: z.infer<typeof serverEnvironment> | undefined;

export function getServerEnvironment() {
  if (cachedEnvironment) return cachedEnvironment;
  const result = serverEnvironment.safeParse(process.env);
  if (!result.success) throw new Error("Required server environment variables are missing or invalid.");
  cachedEnvironment = result.data;
  return cachedEnvironment;
}
