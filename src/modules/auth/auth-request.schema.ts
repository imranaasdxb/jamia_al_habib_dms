import { z } from "zod";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";

export const emailSchema = z.email().trim().toLowerCase().max(254);
const passwordSchema = z.string().min(12).max(128)
  .regex(VALIDATION_PATTERNS.passwordLetter).regex(VALIDATION_PATTERNS.passwordDigit);
const otpSchema = z.string().regex(VALIDATION_PATTERNS.otp);

export const authRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("signup"), name: z.string().trim().min(2).max(100),
    email: emailSchema, password: passwordSchema }),
  z.strictObject({ action: z.literal("login"), email: emailSchema,
    password: z.string().min(1).max(128), rememberMe: z.boolean().optional() }),
  z.strictObject({ action: z.literal("sendOtp"), email: emailSchema,
    type: z.enum(["email-verification", "forget-password"]) }),
  z.strictObject({ action: z.literal("verifyEmail"), email: emailSchema, otp: otpSchema }),
  z.strictObject({ action: z.literal("checkReset"), email: emailSchema,
    otp: otpSchema, type: z.literal("forget-password") }),
  z.strictObject({ action: z.literal("reset"), email: emailSchema,
    otp: otpSchema, password: passwordSchema }),
  z.strictObject({ action: z.literal("logout") }),
]);

export const identityResponseSchema = z.object({
  user: z.object({ id: z.string().min(1), email: emailSchema, emailVerified: z.boolean() }),
});

export type AuthRequest = z.infer<typeof authRequestSchema>;
