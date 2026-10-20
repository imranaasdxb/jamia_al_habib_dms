import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getServerEnvironment } from "@/lib/env";

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth() {
  if (instance) return instance;
  const environment = getServerEnvironment();
  instance = createNeonAuth({
    baseUrl: environment.NEON_AUTH_BASE_URL,
    cookies: { secret: environment.NEON_AUTH_COOKIE_SECRET, sessionDataTtl: 60, sameSite: "strict" },
    logLevel: "error",
  });
  return instance;
}
