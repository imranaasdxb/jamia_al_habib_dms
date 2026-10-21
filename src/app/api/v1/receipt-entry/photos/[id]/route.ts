import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { changeReceiptPhoto, receiptPhoto } from "@/modules/receipts/receipts.repository";
import { receiptFailure } from "@/modules/receipts/receipts.http";
import { boundedBody, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function idFor(context: Context) { const parsed = z.uuid().safeParse((await context.params).id); if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400); return parsed.data; }
export async function GET(_request: NextRequest, context: Context) {
  try { return new NextResponse(await receiptPhoto(await idFor(context)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch (error) { return receiptFailure(error); }
}
async function mutate(request: NextRequest, context: Context, remove: boolean) {
  try {
    requireSameOrigin(request); const id = await idFor(context);
    const version = z.coerce.number().int().positive().safeParse(request.headers.get("x-receipt-version"));
    if (!version.success) throw new AuthFailure("INVALID_INPUT", 400);
    const file = remove ? null : new File([await boundedBody(request, 2 * 1024 * 1024)], "receipt", { type: request.headers.get("content-type") ?? "" });
    return userResponse(await changeReceiptPhoto(id, version.data, file));
  } catch (error) { return receiptFailure(error); }
}
export async function POST(request: NextRequest, context: Context) { return mutate(request, context, false); }
export async function DELETE(request: NextRequest, context: Context) { return mutate(request, context, true); }
