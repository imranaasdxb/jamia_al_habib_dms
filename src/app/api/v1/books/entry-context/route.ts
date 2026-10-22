import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { bookEntryContext } from "@/modules/books/books.repository";
import { bookEntryQuerySchema } from "@/modules/books/books.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const query = bookEntryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await bookEntryContext(query.data.page));
  } catch (error) { return bookFailure(error); }
}
