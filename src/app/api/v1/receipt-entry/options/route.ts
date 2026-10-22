import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import loadReceiptDonationOptions from "@/modules/receipts/donation-options.repository";
import { userFailure, userResponse } from "@/modules/users/users.http";

export const runtime = "nodejs";
export async function GET() {
  try { return userResponse(await loadReceiptDonationOptions()); }
  catch (error) {
    if (error instanceof AuthFailure) return userFailure(error);
    const cause = error instanceof Error ? error.cause : undefined;
    const details: { type: string; sqlState?: string; object?: string; message?: string; source?: string[] } = {
      type: error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError" : "Error",
    };
    if (process.env.NODE_ENV === "development" && error instanceof TypeError) {
      // Standard JavaScript TypeErrors identify the failing operation. Never include
      // database errors, queries, parameters, or connection strings in this field.
      const message = error.message.split("\n")[0] ?? "";
      if (!/\b(select|insert|update|delete|parameters|params)\b|:\/\//i.test(message)) {
        details.message = message.replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]").slice(0, 240);
      }
      details.source = (error.stack ?? "").split("\n").slice(1)
        .filter((line) => /^\s*at\s/.test(line) && !/:\/\//.test(line)).slice(0, 3).map((line) => line.trim());
    }
    for (const value of [cause, error]) {
      if (typeof value !== "object" || value === null || !("code" in value)
        || typeof value.code !== "string" || !/^[A-Z0-9]{5}$/.test(value.code)) continue;
      details.sqlState = value.code;
      if (["42P01", "42703", "42883"].includes(value.code) && "message" in value && typeof value.message === "string") {
        details.object = /^(?:column|relation|function) "?([a-z_][a-z0-9_.]*)/i.exec(value.message)?.[1];
      }
      break;
    }
    // Log identifiers only: never queries, parameters, credentials or donor data.
    console.error("[receipt-options] Donation lookup failed", details);
    return NextResponse.json({ data: null, error: { code: "RECEIPT_OPTIONS_UNAVAILABLE",
      ...(process.env.NODE_ENV === "development" ? { details } : {}) }, meta: {} },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
