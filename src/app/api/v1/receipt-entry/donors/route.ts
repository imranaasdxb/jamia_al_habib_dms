import { AuthFailure } from "@/modules/auth/auth.types";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";
import { donorSuggestions } from "@/modules/receipts/receipts.repository";
import { receiptFailure } from "@/modules/receipts/receipts.http";
import { userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const phone = request.nextUrl.searchParams.get("phone") ?? "";
    if (!VALIDATION_PATTERNS.indianMobile.test(phone)) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await donorSuggestions(phone));
  } catch (error) { return receiptFailure(error); }
}
