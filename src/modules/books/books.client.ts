"use client";
import { z } from "zod";
import type { BookRow, SingleBookValues } from "@/modules/books/books.schema";
import type { MessageKey } from "@/lib/i18n/messages";

const failureSchema = z.object({ error: z.object({ code: z.string(), bookNumber: z.string().optional() }) });
export class BookRequestError extends Error {
  constructor(code: string, public readonly bookNumber?: string) { super(code); }
}
export async function booksRequest(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const failure = failureSchema.safeParse(payload);
    throw new BookRequestError(failure.success ? failure.data.error.code : "BOOKS_UNAVAILABLE",
      failure.success ? failure.data.error.bookNumber : undefined);
  }
  return payload;
}
export function booksError(error: unknown): MessageKey {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, MessageKey> = { ACCESS_DENIED: "authDenied", SESSION_EXPIRED: "authExpired", INVALID_INPUT: "booksInvalid",
    BOOK_NUMBER_EXISTS: "booksDuplicate", RECEIPT_RANGE_USED: "booksOverlap", BOOK_EDITION_INVALID: "booksEditionInvalid",
    BOOK_OPTION_INACTIVE: "booksInactiveOption", BOOK_OPERATION_CHANGED: "booksOperationChanged",
    ASSIGNMENT_FUNDRAISER: "assignFundraiserInactive", ASSIGNMENT_AREAS: "assignAreasInactive", ASSIGNMENT_CHANGED: "assignChanged",
    ASSIGNMENT_NOT_FOUND: "assignNotFound", ASSIGNMENTS_UNAVAILABLE: "assignFailed",
    RETURNS_UNAVAILABLE: "returnsFailed", RETURN_INVALID: "returnsInvalid", RETURN_MISMATCH: "returnsNeedsFlag",
    RETURN_NOT_OPEN: "returnsChanged", RETURN_CHANGED: "returnsChanged", LEFTOVER_SAME_FUNDRAISER: "leftoversSameFundraiser",
    LEFTOVER_CHANGED: "leftoversChanged", LEFTOVERS_UNAVAILABLE: "leftoversFailed" };
  return messages[code] ?? "booksFailed";
}
export const bookStatusLabels: Record<BookRow["status"], MessageKey> = { IN_STOCK: "booksInStock", ASSIGNED: "booksAssigned",
  FLAGGED: "booksFlagged", CLOSED: "booksClosed", PARTLY_USED: "booksPartlyUsed", LEFTOVER_ASSIGNED: "booksLeftoverAssigned", LOST: "booksLost" };
export const bookDefaults = (): SingleBookValues => ({ stockDate: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
  editionId: "", bookType: "REGULAR", tokenValue: "", remarks: "", bookNumber: "", receiptFrom: "", receiptTo: "" });
