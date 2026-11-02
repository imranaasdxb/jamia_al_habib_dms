"use client";

import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import type { AuthFormValues, AuthScreen } from "@/modules/auth/auth.schema";
import type { MessageKey } from "@/lib/i18n/messages";

const errorSchema = z.object({ code: z.string().optional() });

export function authErrorMessage(error: unknown): MessageKey {
  const parsed = errorSchema.safeParse(error);
  const code = parsed.success ? parsed.data.code ?? "" : "";
  if (code === "ACCOUNT_PENDING") return "authPending";
  if (code === "SIGNUP_CLOSED") return "authSignupClosed";
  if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "authAccountExists";
  if (code === "ACCESS_DENIED") return "authDenied";
  if (code === "RATE_LIMITED" || code === "TOO_MANY_ATTEMPTS"
    || code === "TOO_MANY_REQUESTS") return "authRateLimited";
  if (code === "FLOW_EXPIRED" || code === "SESSION_EXPIRED") return "authExpired";
  if (code.includes("OTP") || code === "INVALID_VERIFICATION_CODE") return "authInvalidOtp";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD"
    || code === "USER_NOT_FOUND") return "authInvalidCredentials";
  if (code === "AUTH_UNAVAILABLE" || code.startsWith("NETWORK_")) return "authUnavailable";
  return "authActionFailed";
}

interface SubmitResult { redirectTo?: string; error?: unknown }

export async function submitAuthForm(
  screen: AuthScreen, values: AuthFormValues, flowEmail: string,
): Promise<SubmitResult> {
  if (screen === "signup") {
    const result = await authClient.signUp.email({ email: values.email,
      password: values.password, name: values.fullName });
    return result.error ? { error: result.error } : { redirectTo: "/verify-email/signup" };
  }
  if (screen === "login") {
    // The same protected proxy sets both provider and application cookies. Login
    // does not need the SDK's client-session refresh before navigating.
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: values.email, password: values.password }),
    });
    const payload: unknown = await response.json();
    const failure = errorSchema.safeParse(payload);
    if (!response.ok && failure.success && failure.data.code === "EMAIL_NOT_VERIFIED") return { redirectTo: "/verify-email/signup" };
    return response.ok ? { redirectTo: "/dashboard" } : { error: payload };
  }
  if (screen === "forgot") {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: values.email, type: "forget-password",
    });
    return result.error ? { error: result.error } : { redirectTo: "/verify-email/reset" };
  }
  if (screen === "verifySignup") {
    const result = await authClient.emailOtp.verifyEmail({ email: flowEmail, otp: values.code });
    return result.error ? { error: result.error } : { redirectTo: "/login?notice=verified" };
  }
  if (screen === "verifyReset") {
    const result = await authClient.emailOtp.checkVerificationOtp({
      email: flowEmail, otp: values.code, type: "forget-password",
    });
    return result.error ? { error: result.error } : { redirectTo: "/reset-password" };
  }
  const response = await fetch("/api/v1/auth/reset-password", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: values.password, confirmPassword: values.confirmPassword }),
  });
  const payload: unknown = await response.json();
  return response.ok ? { redirectTo: "/login?notice=password-reset" } : { error: payload };
}
