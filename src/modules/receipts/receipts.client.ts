"use client";
import { sessionFetch } from "@/lib/auth/session-fetch";
import { z } from "zod";
import type { MessageKey } from "@/lib/i18n/messages";

const failureSchema = z.object({ error: z.object({ code: z.string(), receiptNumber: z.number().optional() }) });
export class ReceiptRequestError extends Error { constructor(code: string, public readonly number?: number) { super(code); } }
export async function receiptRequest(url: string, options?: RequestInit): Promise<unknown> {
  const response = await sessionFetch(url, { cache: "no-store", ...options }); const payload: unknown = await response.json();
  if (!response.ok) { const parsed = failureSchema.safeParse(payload); throw new ReceiptRequestError(parsed.success ? parsed.data.error.code : "RECEIPTS_UNAVAILABLE", parsed.success ? parsed.data.error.receiptNumber : undefined); }
  return payload;
}
export function receiptError(error: unknown): MessageKey {
  if (error instanceof z.ZodError) {
    if (process.env.NODE_ENV === "development") console.error("[receipt-entry] Response format mismatch", error.issues.map((issue) => issue.path.map(String).join(".")));
    return "receiptResponseMismatch";
  }
  const code = error instanceof Error ? error.message : "";
  const labels: Record<string, MessageKey> = { ACCESS_DENIED: "authDenied", SESSION_EXPIRED: "authExpired", INVALID_INPUT: "receiptInvalid", RECEIPT_INVALID: "receiptInvalid",
    RECEIPT_DUPLICATE: "receiptDuplicate", RECEIPT_STALE: "receiptStale", RECEIPT_LOCKED: "receiptLocked", RECEIPT_INCOMPLETE: "receiptIncomplete",
    RECEIPT_CANCELLATION_NOT_ALLOWED: "receiptCancelSavedBlocked",
    RECEIPT_CASH_LIMIT: "receiptCashLimit", RECEIPT_DIGITAL_LIMIT: "receiptDigitalLimit", RECEIPT_TOTAL_LIMIT: "receiptTotalLimit",
    RECEIPT_OPTIONS_UNAVAILABLE: "receiptOptionsUnavailable", AUTH_UNAVAILABLE: "receiptOptionsUnavailable",
    RECEIPT_RANGE: "receiptRangeError", RECEIPT_BOOK_NOT_FOUND: "assignNotFound", INVALID_PHOTO: "receiptPhotoInvalid",
    STORAGE_NOT_CONFIGURED: "receiptPhotoFailed", STORAGE_UNAVAILABLE: "receiptPhotoFailed",
    RECEIPT_SETUP_REQUIRED: "receiptSetupRequired", RECEIPT_DATABASE_BUSY: "receiptDatabaseBusy", RECEIPT_SETUP_PERMISSIONS: "receiptSetupPermissions" };
  return labels[code] ?? "receiptFailed";
}
