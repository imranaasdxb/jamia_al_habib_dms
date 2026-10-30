"use client";
import { receiptRequest } from "@/modules/receipts/receipts.client";
import type { MessageKey } from "@/lib/i18n/messages";

export const donorRequest = receiptRequest;
export function donorError(error: unknown): MessageKey {
  const code = error instanceof Error ? error.message : "";
  return code === "SESSION_EXPIRED" ? "authExpired" : code === "ACCESS_DENIED" ? "authDenied"
    : code === "INVALID_INPUT" ? "donorsInvalid" : "donorsFailed";
}
