import { z } from "zod";

export const MASTER_KINDS = ["EDITION", "BOOK_TYPE", "TOKEN_VALUE", "DONATION_CATEGORY", "DONATION_HEAD", "RESPONSIBILITY", "AREA",
  "PAYMENT_MODE", "UPI_APP", "BANK", "BANK_ACCOUNT", "RECEIPT_REASON", "FLAG_REASON"] as const;
export const masterKindSchema = z.enum(MASTER_KINDS);
export const masterValuesSchema = z.strictObject({
  code: z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).transform((value) => value.toUpperCase()),
  nameEn: z.string().trim().min(2).max(120), nameUr: z.string().trim().min(2).max(120),
  active: z.boolean(), notes: z.string().trim().max(1000),
  effectiveFrom: z.union([z.literal(""), z.iso.date()]), needsDetail: z.boolean(),
  level: z.enum(["", "STATE", "DISTRICT", "BLOCK", "VILLAGE"]),
  parentId: z.union([z.literal(""), z.uuid()]),
  tokenValue: z.enum(["", "10", "20", "50"]),
  accountName: z.union([z.literal(""), z.string().trim().min(2).max(120)]), lastFour: z.union([z.literal(""), z.string().regex(/^\d{4}$/)]),
  upiId: z.union([z.literal(""), z.string().trim().max(200).regex(/^[a-zA-Z0-9._-]{2,128}@[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/)]),
});
export type MasterKind = z.infer<typeof masterKindSchema>;
export type MasterValues = z.infer<typeof masterValuesSchema>;
export function masterEditorSchema(kind: MasterKind) {
  return masterValuesSchema.superRefine((values, context) => {
    const required = (field: keyof MasterValues) => {
      if (!values[field]) context.addIssue({ code: "custom", path: [field], message: "Required" });
    };
    if (kind === "EDITION") required("effectiveFrom");
    if (kind === "AREA") {
      required("level");
      if (values.level !== "STATE") required("parentId");
      else if (values.parentId) context.addIssue({ code: "custom", path: ["parentId"], message: "State has no parent" });
    }
    if (kind === "TOKEN_VALUE") required("tokenValue");
    if (kind === "DONATION_HEAD") required("parentId");
    if (kind === "BANK_ACCOUNT") { required("parentId"); required("accountName"); required("lastFour"); }
  });
}
export const masterRowSchema = masterValuesSchema.extend({ id: z.uuid(), kind: masterKindSchema,
  builtIn: z.boolean(), updatedAt: z.iso.datetime(), parentNameEn: z.string(), parentNameUr: z.string() });
export const masterQuerySchema = z.object({
  kind: masterKindSchema, search: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  level: z.enum(["", "STATE", "DISTRICT", "BLOCK", "VILLAGE"]).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const masterSubmissionSchema = z.strictObject({ kind: masterKindSchema, values: masterValuesSchema,
  version: z.iso.datetime().optional(), reason: z.string().trim().max(500) }).superRefine((input, context) => {
  const result = masterEditorSchema(input.kind).safeParse(input.values);
  if (!result.success) for (const issue of result.error.issues) context.addIssue({ ...issue, path: ["values", ...issue.path] });
});
export const mastersResponseSchema = z.object({ data: z.array(masterRowSchema),
  meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export const masterSaveResponseSchema = z.object({ data: masterRowSchema });
export type MasterRow = z.infer<typeof masterRowSchema>;
export type MasterQuery = z.infer<typeof masterQuerySchema>;
export type MasterSubmission = z.infer<typeof masterSubmissionSchema>;
export type MasterPage = { rows: MasterRow[]; total: number; page: number; pageSize: number };
export const fixedMasterKinds: readonly MasterKind[] = ["BOOK_TYPE", "TOKEN_VALUE", "PAYMENT_MODE", "DONATION_CATEGORY"];
