"use client";
import { z } from "zod";
import type { MessageKey } from "@/lib/i18n/messages";

const errorSchema = z.object({ error: z.object({ code: z.string() }).nullable(),
  meta: z.object({ changed: z.boolean().optional() }).optional() });
class UserActionError extends Error {
  constructor(code: string, public readonly dataChanged = false) { super(code); }
}
export async function usersRequest(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new UserActionError(parsed.success ? parsed.data.error?.code ?? "AUTH_UNAVAILABLE" : "AUTH_UNAVAILABLE",
      parsed.success && parsed.data.meta?.changed === true);
  }
  return payload;
}
export function userMutationChanged(error: unknown) {
  return error instanceof UserActionError && error.dataChanged;
}
export function userErrorMessage(error: unknown): MessageKey {
  const messages: Record<string, MessageKey> = {
    USER_EXISTS: "usersDuplicate", ACCESS_DENIED: "authDenied", SESSION_EXPIRED: "authExpired",
    RATE_LIMITED: "usersOtpWait", FLOW_BUSY: "usersFlowBusy", FLOW_EXPIRED: "usersFlowExpired",
    OTP_INVALID: "authInvalidOtp", NEON_ADMIN_REQUIRED: "usersNeonAdminRequired",
    STORAGE_NOT_CONFIGURED: "usersStorageSetup", STORAGE_UNAVAILABLE: "usersStorageFailed",
    INVALID_PHOTO: "usersInvalidPhoto", LAST_ADMIN: "usersLastAdmin", CANNOT_CHANGE_SELF: "usersSelfProtected",
    STALE_USER: "usersStale", VERIFICATION_PENDING: "usersPendingVerification", INVALID_INPUT: "usersInvalidDetails",
  };
  return error instanceof UserActionError ? messages[error.message] ?? "authUnavailable" : "authUnavailable";
}
