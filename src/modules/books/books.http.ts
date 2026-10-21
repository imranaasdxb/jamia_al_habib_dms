import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { BookConflict } from "@/modules/books/books.repository";

export function bookFailure(error: unknown) {
  return NextResponse.json({ data: null, error: { code: error instanceof AuthFailure ? error.code : "BOOKS_UNAVAILABLE",
    ...(error instanceof BookConflict ? { bookNumber: error.bookNumber } : {}) }, meta: {} },
  { status: error instanceof AuthFailure ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
