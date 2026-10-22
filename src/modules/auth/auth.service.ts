import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth/server";
import { APP_SESSION_COOKIE, AUTH_FLOW_COOKIE, cookieOptions,
  decodeAuthFlow, encodeAuthFlow } from "@/lib/auth/flow-cookie";
import { authRequestSchema, identityResponseSchema } from "@/modules/auth/auth-request.schema";
import { bindIdentity, consumeAuthRateLimit, createAppSession,
  revokeAppSession, revokeSessionsAfterPasswordReset } from "@/modules/auth/auth.repository";
import { reserveSignup } from "@/modules/auth/auth.repository";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { NextRequest } from "next/server";
import type { AuthFlow } from "@/lib/auth/flow-cookie";
import type { AuthRequest } from "@/modules/auth/auth-request.schema";

const actions: Record<string, AuthRequest["action"]> = {
  "sign-up/email": "signup",
  "sign-in/email": "login",
  "email-otp/send-verification-otp": "sendOtp",
  "email-otp/verify-email": "verifyEmail",
  "email-otp/check-verification-otp": "checkReset",
  "email-otp/reset-password": "reset",
  "sign-out": "logout",
};

export interface AuthRouteContext { params: Promise<{ path: string[] }> }

export function authErrorResponse(code: string, status: number) {
  return NextResponse.json({ code, message: "Unable to complete this account operation." }, { status });
}

export function requireSameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    throw new AuthFailure("ACCESS_DENIED");
  }
}

function requireFlow(input: AuthRequest, flow: AuthFlow | null) {
  if (input.action === "verifyEmail" || input.action === "checkReset" || input.action === "reset"
    || (input.action === "sendOtp" && input.type === "email-verification")) {
    const purpose = input.action === "checkReset" || input.action === "reset" ? "reset" : "signup";
    if (!flow || flow.email !== input.email.toLowerCase() || flow.purpose !== purpose) {
      throw new AuthFailure("FLOW_EXPIRED", 400);
    }
    if (input.action === "reset" && (!flow.otp || flow.otp !== input.otp)) {
      throw new AuthFailure("FLOW_EXPIRED", 400);
    }
  }
}

function setFlow(response: NextResponse, flow: AuthFlow) {
  response.cookies.set(AUTH_FLOW_COOKIE, encodeAuthFlow(flow), {
    ...cookieOptions, maxAge: Math.max(0, Math.floor((flow.expiresAt - Date.now()) / 1000)),
  });
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    throw new AuthFailure("AUTH_UNAVAILABLE", 503);
  }
}

export async function handleAuthPost(request: NextRequest, context: AuthRouteContext) {
  const startedAt = performance.now();
  const timings: string[] = [];
  async function measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      timings.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
    }
  }
  function finish(response: NextResponse) {
    response.headers.append("Server-Timing", [...timings,
      `auth_total;dur=${(performance.now() - startedAt).toFixed(1)}`].join(", "));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  try {
    requireSameOrigin(request);
    const path = (await context.params).path.join("/");
    const action = actions[path];
    if (!action) return authErrorResponse("ACCESS_DENIED", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 8192) {
      return authErrorResponse("INVALID_INPUT", 413);
    }
    const body = await request.clone().text();
    if (body.length > 8192) return authErrorResponse("INVALID_INPUT", 413);
    const raw: unknown = body.trim() ? JSON.parse(body) : {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return authErrorResponse("INVALID_INPUT", 400);
    }
    const parsed = authRequestSchema.safeParse({ ...raw, action });
    if (!parsed.success) return authErrorResponse("INVALID_INPUT", 400);
    const input = parsed.data;
    const email = "email" in input ? input.email : "";
    const ip = request.headers.get("x-real-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!await measure("rate_limit_db", () => consumeAuthRateLimit(action, email, ip))) {
      return finish(authErrorResponse("RATE_LIMITED", 429));
    }
    const flow = decodeAuthFlow(request.cookies.get(AUTH_FLOW_COOKIE)?.value);
    requireFlow(input, flow);
    if (input.action === "signup" && !await reserveSignup(input.email, input.name)) {
      throw new AuthFailure("SIGNUP_CLOSED");
    }

    if (input.action === "logout") {
      const { data: session } = await measure("session_lookup", () => getAuth().getSession());
      const token = request.cookies.get(APP_SESSION_COOKIE)?.value;
      if (session?.user && token) {
        const identity = { id: session.user.id, email: session.user.email,
          emailVerified: session.user.emailVerified };
        await measure("app_session_db", () => revokeAppSession(identity, token));
      }
    }

    // Let the SDK proxy handle managed Auth paths and all provider session cookies.
    // The allowlist above deliberately excludes user/admin management and OTP sign-in.
    const { upstream, payload } = await measure("neon_auth", async () => {
      const upstream = await getAuth().handler().POST(request, context);
      return { upstream, payload: await readPayload(upstream) };
    });
    const response = new NextResponse(upstream.body, { status: upstream.status, headers: upstream.headers });
    response.headers.set("Cache-Control", "no-store");

    if (!upstream.ok) {
      const failure = z.object({ code: z.string().optional() }).safeParse(payload);
      if (input.action === "login" && failure.success && failure.data.code === "EMAIL_NOT_VERIFIED") {
        setFlow(response, { email: input.email, purpose: "signup", expiresAt: Date.now() + 600000 });
      }
      return finish(response);
    }

    if (input.action === "signup" || input.action === "login") {
      const identity = identityResponseSchema.safeParse(payload);
      if (!identity.success || identity.data.user.email !== input.email.toLowerCase()) {
        throw new AuthFailure("AUTH_UNAVAILABLE", 503);
      }
      if (input.action === "signup") {
        await bindIdentity(identity.data.user);
        setFlow(response, { email: input.email, purpose: "signup", expiresAt: Date.now() + 600000 });
      } else {
        const token = await measure("app_session_db", () => createAppSession(identity.data.user));
        response.cookies.set(APP_SESSION_COOKIE, token, { ...cookieOptions, maxAge: 43200 });
        response.cookies.delete(AUTH_FLOW_COOKIE);
      }
    }
    if (input.action === "sendOtp") {
      setFlow(response, { email: input.email,
        purpose: input.type === "forget-password" ? "reset" : "signup",
        expiresAt: Date.now() + 600000 });
    }
    if (input.action === "checkReset") {
      const checked = z.object({ success: z.boolean() }).safeParse(payload);
      if (!checked.success || !checked.data.success || !flow) throw new AuthFailure("OTP_INVALID", 400);
      setFlow(response, { ...flow, otp: input.otp });
    }
    if (input.action === "verifyEmail" || input.action === "reset" || input.action === "logout") {
      response.cookies.delete(AUTH_FLOW_COOKIE);
    }
    if (input.action === "reset") await revokeSessionsAfterPasswordReset(input.email);
    if (input.action === "reset" || input.action === "logout") {
      response.cookies.delete(APP_SESSION_COOKIE);
    }
    return finish(response);
  } catch (error) {
    if (error instanceof AuthFailure) return finish(authErrorResponse(error.code, error.status));
    if (error instanceof SyntaxError) return finish(authErrorResponse("INVALID_INPUT", 400));
    return finish(authErrorResponse("AUTH_UNAVAILABLE", 503));
  }
}
