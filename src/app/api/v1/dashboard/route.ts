import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import { dashboardQuerySchema } from "@/modules/dashboard/dashboard.schema";
import { readDashboard } from "@/modules/dashboard/dashboard.repository";
import { userResponse } from "@/modules/users/users.http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const startedAt = performance.now();
  const timings: string[] = [];
  function finish(response: Response) {
    response.headers.set("Server-Timing", [...timings, `dashboard_total;dur=${(performance.now() - startedAt).toFixed(1)}`].join(", "));
    return response;
  }
  try {
    const query = dashboardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    const data = await readDashboard(query.data, (name, milliseconds) => timings.push(`${name};dur=${milliseconds.toFixed(1)}`));
    return finish(userResponse(data));
  } catch (error) {
    const failure = error instanceof AuthFailure ? error : new AuthFailure("DASHBOARD_UNAVAILABLE", 503);
    const cause = error instanceof Error ? error.cause : undefined;
    const databaseError = [error, cause].find((value) => typeof value === "object" && value !== null && "code" in value && typeof value.code === "string");
    return finish(NextResponse.json({ data: null, error: { code: failure.code,
      ...(process.env.NODE_ENV === "development" && typeof databaseError === "object" && databaseError !== null && "code" in databaseError
        ? { details: { sqlState: String(databaseError.code) } } : {}) }, meta: {} },
    { status: failure.status, headers: { "Cache-Control": "no-store" } }));
  }
}
