import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { receiptFailure } from "@/modules/receipts/receipts.http";
import { changeReceiptWorkflow, getReceiptWorkflow } from "@/modules/receipts/receipts.repository";
import { receiptWorkflowActionSchema } from "@/modules/receipts/receipts.schema";
import { boundedBody, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("returnId");
    if (raw && !z.uuid().safeParse(raw).success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await getReceiptWorkflow(raw || undefined));
  } catch (error) { return receiptFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8192))); }
    catch (error) { if (error instanceof AuthFailure) throw error; throw new AuthFailure("INVALID_INPUT", 400); }
    const parsed = receiptWorkflowActionSchema.safeParse(payload);
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await changeReceiptWorkflow(parsed.data));
  } catch (error) { return receiptFailure(error); }
}
