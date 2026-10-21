import { NextResponse } from "next/server";
import { ReceiptFailure, receiptDatabaseFailure } from "@/modules/receipts/receipts.repository";

export function receiptFailure(error: unknown) {
  const failure = receiptDatabaseFailure(error);
  return NextResponse.json({ data: null, error: { code: failure.code,
    ...(failure instanceof ReceiptFailure && failure.receiptNumber ? { receiptNumber: failure.receiptNumber } : {}),
    ...(process.env.NODE_ENV === "development" && failure instanceof ReceiptFailure && failure.setupDetails
      ? { setup: failure.setupDetails } : {}) }, meta: {} },
    { status: failure.status, headers: { "Cache-Control": "no-store" } });
}
