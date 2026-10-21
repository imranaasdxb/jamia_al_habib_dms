import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { addBookStock, listBooks } from "@/modules/books/books.repository";
import { booksQuerySchema, bookSubmissionSchema } from "@/modules/books/books.schema";
import { userJson, userResponse } from "@/modules/users/users.http";
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
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const parsed = bookSubmissionSchema.safeParse(await userJson(request));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await addBookStock(parsed.data), 201);
  } catch (error) { return bookFailure(error); }
}
