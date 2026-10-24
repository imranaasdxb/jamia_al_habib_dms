import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE, AUTH_FLOW_COOKIE, cookieOptions } from "@/lib/auth/flow-cookie";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try { requireSameOrigin(request); }
  catch {
    return NextResponse.json({ data: null, error: { code: "ACCESS_DENIED" }, meta: {} },
      { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.json({ data: null, error: null, meta: {} },
    { headers: { "Cache-Control": "no-store" } });
  const prefix = "__Secure-neon-auth";
  const names = new Set([APP_SESSION_COOKIE, AUTH_FLOW_COOKIE,
    `${prefix}.session_token`, `${prefix}.local.session_data`, `${prefix}.session_challenge`, `${prefix}.session_challange`,
    ...request.cookies.getAll().map((cookie) => cookie.name).filter((name) => name.startsWith(`${prefix}.`)),
  ]);
  for (const name of names) {
    response.cookies.set(name, "", { ...cookieOptions, secure: name.startsWith("__Secure-") || cookieOptions.secure,
      maxAge: 0, expires: new Date(0) });
  }
  return response;
}
