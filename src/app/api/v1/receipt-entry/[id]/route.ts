import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { receiptFailure } from "@/modules/receipts/receipts.http";
import { getReceiptBook, mutateReceiptBook } from "@/modules/receipts/receipts.repository";
import { receiptActionSchema } from "@/modules/receipts/receipts.schema";
import { boundedBody, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function target(context: Context) { const parsed = z.uuid().safeParse((await context.params).id); if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400); return parsed.data; }
export async function GET(request: NextRequest, context: Context) {
  try {
    const page = z.coerce.number().int().min(1).max(100000000).safeParse(request.nextUrl.searchParams.get("page") ?? 1);
    if (!page.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await getReceiptBook(await target(context), page.data), 200, { receiptContract: "book-submission-v1" });
  } catch (error) { return receiptFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request); const id = await target(context);
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(await boundedBody(request, 65536))); }
    catch (error) { if (error instanceof AuthFailure) throw error; throw new AuthFailure("INVALID_INPUT", 400); }
    const parsed = receiptActionSchema.safeParse(payload);
    if (!parsed.success) throw new AuthFailure("RECEIPT_INVALID", 400);
    return userResponse(await mutateReceiptBook(id, parsed.data), 200, { receiptContract: "book-submission-v1" });
  } catch (error) { return receiptFailure(error); }
}
