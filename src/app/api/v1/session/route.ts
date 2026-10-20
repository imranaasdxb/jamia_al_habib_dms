import { NextResponse } from "next/server";
import { getAccount } from "@/lib/auth/session";
import { APP_SESSION_COOKIE } from "@/lib/auth/flow-cookie";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const account = await getAccount(true);
    if (!account) throw new AuthFailure("SESSION_EXPIRED", 401);
    return NextResponse.json({ data: { sessionTimeoutMinutes: account.sessionTimeoutMinutes },
      error: null, meta: {} }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = NextResponse.json({ data: null,
      error: { code: error instanceof AuthFailure ? error.code : "AUTH_UNAVAILABLE" }, meta: {} },
    { status: error instanceof AuthFailure ? 401 : 503 });
    if (error instanceof AuthFailure) response.cookies.delete(APP_SESSION_COOKIE);
    return response;
  }
}
