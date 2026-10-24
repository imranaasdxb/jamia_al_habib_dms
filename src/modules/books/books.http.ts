import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { BookConflict } from "@/modules/books/books.repository";

export function bookFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const setupRequired = [error, cause].some((item) => typeof item === "object" && item !== null && "code" in item && item.code === "42703"
    && "message" in item && typeof item.message === "string" && item.message.includes("edition_book_number"));
  return NextResponse.json({ data: null, error: { code: error instanceof AuthFailure ? error.code : setupRequired ? "BOOKS_EDITION_SETUP_REQUIRED" : "BOOKS_UNAVAILABLE",
    ...(error instanceof BookConflict ? { bookNumber: error.bookNumber } : {}) }, meta: {} },
  { status: error instanceof AuthFailure ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
