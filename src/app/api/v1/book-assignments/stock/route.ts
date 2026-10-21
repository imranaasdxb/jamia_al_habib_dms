import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { availableBooks } from "@/modules/books/assignments.repository";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
const querySchema = z.object({ search: z.string().trim().max(100).default(""), date: z.iso.date(), page: z.coerce.number().int().min(1).max(100000).default(1) });
export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await availableBooks(parsed.data.search, parsed.data.date, parsed.data.page);
    return userResponse(rows, 200, meta);
  } catch (error) { return bookFailure(error); }
}
