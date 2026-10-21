import { AuthFailure } from "@/modules/auth/auth.types";
import { receiptFailure } from "@/modules/receipts/receipts.http";
import { receiptQueue } from "@/modules/receipts/receipts.repository";
import { receiptQuerySchema } from "@/modules/receipts/receipts.schema";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const parsed = receiptQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await receiptQueue(parsed.data); return userResponse(rows, 200, meta);
  } catch (error) { return receiptFailure(error); }
}
