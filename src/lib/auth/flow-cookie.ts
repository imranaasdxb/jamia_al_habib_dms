import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getServerEnvironment } from "@/lib/env";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";

export const AUTH_FLOW_COOKIE = "dms_auth_flow";
export const APP_SESSION_COOKIE = "dms_session";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

const flowSchema = z.strictObject({
  email: z.email(),
  purpose: z.enum(["signup", "reset"]),
  expiresAt: z.number(),
  otp: z.string().regex(VALIDATION_PATTERNS.otp).optional(),
});

export type AuthFlow = z.infer<typeof flowSchema>;

function encryptionKey() {
  return createHash("sha256").update(getServerEnvironment().NEON_AUTH_COOKIE_SECRET).digest();
}

export function encodeAuthFlow(flow: AuthFlow): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(flow), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decodeAuthFlow(value: string | undefined): AuthFlow | null {
  if (!value || value.length > 2048) return null;
  try {
    const encrypted = Buffer.from(value, "base64url");
    if (encrypted.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]);
    const result = flowSchema.safeParse(JSON.parse(decrypted.toString("utf8")));
    return result.success && result.data.expiresAt > Date.now() ? result.data : null;
  } catch {
    // A malformed, expired or tampered flow grants no verification/reset access.
    return null;
  }
}
