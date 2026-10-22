import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { leftoverReassignOptions } from "@/modules/books/leftover-options.repository";
import { leftoverOptionsQuerySchema } from "@/modules/books/leftovers.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const query = leftoverOptionsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await leftoverReassignOptions(query.data));
  } catch (error) { return bookFailure(error); }
}
