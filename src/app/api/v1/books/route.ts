import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { listBooks } from "@/modules/books/books.repository";
import { booksQuerySchema } from "@/modules/books/books.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const query = booksQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await listBooks(query.data);
    return userResponse(rows, 200, meta);
  } catch (error) { return bookFailure(error); }
}
