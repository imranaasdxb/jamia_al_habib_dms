import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { getEditionSummary } from "@/modules/books/edition-summary.repository";
import { editionSummaryQuerySchema } from "@/modules/books/edition-summary.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().safeParse((await context.params).id);
    const query = editionSummaryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!id.success || !query.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await getEditionSummary(id.data, query.data));
  } catch (error) {
    if (error instanceof AuthFailure) return bookFailure(error);
    return bookFailure(new AuthFailure("EDITION_SUMMARY_UNAVAILABLE", 503));
  }
}
