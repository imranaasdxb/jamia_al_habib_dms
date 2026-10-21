import { z } from "zod";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";

export const userProfileSchema = z.strictObject({
  fullName: z.string().trim().min(2, "errorName").max(100, "errorName"),
  email: z.email("errorEmail").trim().toLowerCase().max(254, "errorEmail"),
  phone: z.string().trim().regex(VALIDATION_PATTERNS.indianMobile, "usersInvalidPhone"),
  role: z.enum(["ADMIN", "STAFF"], { error: "usersInvalidDetails" }),
  language: z.enum(["en", "ur"], { error: "usersInvalidDetails" }),
  age: z.string().trim().refine((value) => value === ""
    || (Number.isInteger(Number(value)) && Number(value) >= 18 && Number(value) <= 80), "usersInvalidAge"),
  gender: z.enum(["UNSPECIFIED", "MALE", "FEMALE", "OTHER"]),
  address: z.string().trim().max(1000, "usersInvalidDetails"),
  remarks: z.string().trim().max(1000, "usersInvalidDetails"),
});

export const createUserSchema = userProfileSchema.extend({
  password: z.string().min(12, "errorPassword").max(128, "errorPassword")
    .regex(VALIDATION_PATTERNS.passwordLetter, "errorPassword")
    .regex(VALIDATION_PATTERNS.passwordDigit, "errorPassword"),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "errorConfirm", path: ["confirmPassword"],
});
export const userActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("onboard"), values: createUserSchema }),
  z.strictObject({ action: z.literal("save"), values: userProfileSchema, version: z.string().min(1) }),
  z.strictObject({ action: z.literal("resend"), flowId: z.uuid() }),
  z.strictObject({ action: z.literal("verify"), flowId: z.uuid(), otp: z.string().regex(VALIDATION_PATTERNS.otp) }),
  z.strictObject({ action: z.literal("block"), blocked: z.boolean() }),
]);

export function userEditorSchema(onboarding: boolean) {
  return userProfileSchema.extend({ password: z.string(), confirmPassword: z.string() })
    .superRefine((values, context) => {
      if (!onboarding) return;
      const parsed = createUserSchema.safeParse(values);
      if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue });
    });
}

export const usersQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  role: z.enum(["ALL", "ADMIN", "STAFF"]).default("ALL"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export type CreateUserValues = z.infer<typeof createUserSchema>;
export type UserProfileValues = z.infer<typeof userProfileSchema>;
export type UsersQuery = z.infer<typeof usersQuerySchema>;

export const usersResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(), fullName: z.string(), email: z.string().nullable(),
    phone: z.string().nullable(), role: z.enum(["ADMIN", "STAFF", "COLLECTOR"]),
    status: z.enum(["PENDING", "ACTIVE", "INACTIVE", "BLOCKED"]), accountCreated: z.boolean(),
    language: z.enum(["en", "ur"]), age: z.number().nullable(),
    gender: z.enum(["UNSPECIFIED", "MALE", "FEMALE", "OTHER"]),
    address: z.string(), remarks: z.string(), hasPhoto: z.boolean(), updatedAt: z.string(),
    verificationPending: z.boolean(),
    verification: z.object({ personId: z.string(), flowId: z.string(), email: z.string(),
      needsVerification: z.boolean(), proofComplete: z.boolean() }).nullable(),
  })),
  meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }),
});

export const verificationResponseSchema = z.object({ data: z.object({
  personId: z.string(), flowId: z.string(), email: z.string(),
  needsVerification: z.boolean(),
  proofComplete: z.boolean(),
}) });
