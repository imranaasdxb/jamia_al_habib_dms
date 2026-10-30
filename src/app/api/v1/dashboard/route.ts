import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { dashboardQuerySchema } from "@/modules/dashboard/dashboard.schema";
import { readDashboard } from "@/modules/dashboard/dashboard.repository";
import { userResponse } from "@/modules/users/users.http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = dashboardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await readDashboard(query.data));
  } catch (error) {
    const failure = error instanceof AuthFailure ? error : new AuthFailure("DASHBOARD_UNAVAILABLE", 503);
    const cause = error instanceof Error ? error.cause : undefined;
    const databaseError = [error, cause].find((value) => typeof value === "object" && value !== null && "code" in value && typeof value.code === "string");
    return NextResponse.json({ data: null, error: { code: failure.code,
      ...(process.env.NODE_ENV === "development" && typeof databaseError === "object" && databaseError !== null && "code" in databaseError
        ? { details: { sqlState: String(databaseError.code) } } : {}) }, meta: {} },
    { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
