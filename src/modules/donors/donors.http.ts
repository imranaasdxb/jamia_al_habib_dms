import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";

export function donorFailure(error: unknown) {
  const code = error instanceof AuthFailure ? error.code : "DONORS_UNAVAILABLE";
  const status = error instanceof AuthFailure ? error.status : 503;
  const cause = error instanceof Error ? error.cause : undefined;
  const databaseError = [error, cause].find((value) => typeof value === "object" && value !== null && "code" in value && typeof value.code === "string");
  return NextResponse.json({ data: null, error: { code,
    ...(process.env.NODE_ENV === "development" && typeof databaseError === "object" && databaseError !== null && "code" in databaseError
      ? { details: { sqlState: String(databaseError.code) } } : {}) }, meta: {} },
  { status, headers: { "Cache-Control": "no-store" } });
}
