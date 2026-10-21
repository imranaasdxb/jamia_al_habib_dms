import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { listLeftovers } from "@/modules/books/leftovers.repository";
import { leftoversQuerySchema } from "@/modules/books/leftovers.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const parsed = leftoversQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await listLeftovers(parsed.data); return userResponse(rows, 200, meta);
  } catch (error) { return bookFailure(error instanceof AuthFailure ? error : new AuthFailure("LEFTOVERS_UNAVAILABLE", 503)); }
}
