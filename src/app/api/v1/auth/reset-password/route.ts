import { NextRequest } from "next/server";
import { z } from "zod";
import { AUTH_FLOW_COOKIE, decodeAuthFlow } from "@/lib/auth/flow-cookie";
import { authErrorResponse, handleAuthPost, requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";

const resetSchema = z.strictObject({ password: z.string().max(128),
  confirmPassword: z.string().max(128) }).refine((value) => value.password === value.confirmPassword);

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const flow = decodeAuthFlow(request.cookies.get(AUTH_FLOW_COOKIE)?.value);
    if (!flow || flow.purpose !== "reset" || !flow.otp) {
      return authErrorResponse("FLOW_EXPIRED", 400);
    }
    const parsed = resetSchema.safeParse(await request.json());
    if (!parsed.success) return authErrorResponse("INVALID_INPUT", 400);
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.delete("content-length");
    const forwarded = new NextRequest(new URL("/api/auth/email-otp/reset-password", request.url), {
      method: "POST", headers: forwardedHeaders,
      body: JSON.stringify({ email: flow.email, otp: flow.otp, password: parsed.data.password }),
    });
    return handleAuthPost(forwarded, { params: Promise.resolve({ path: ["email-otp", "reset-password"] }) });
  } catch (error) {
    return authErrorResponse(error instanceof AuthFailure ? error.code : "INVALID_INPUT", 400);
  }
}
