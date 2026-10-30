import { z } from "zod";
export const reviewKindSchema = z.enum(["RECEIPT_EDIT", "PROFILE_EDIT", "RECEIPT_ISSUE", "BOOK_FLAG"]);
const state = z.enum(["PENDING", "APPROVED", "REJECTED", "USED", "OPEN", "UNDER_REVIEW", "RESOLVED"]);
const day = z.union([z.literal(""), z.iso.date()]);
const stamp = z.iso.datetime({ offset: true });
export const reviewQuerySchema = z.object({
  kind: reviewKindSchema, status: z.enum(["ACTIVE", "ALL", ...state.options]).default("ACTIVE"),
  search: z.string().trim().max(100).default(""), from: day.default(""), to: day.default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: "reviewDateInvalid" });
export const reviewRowSchema = z.object({
  id: z.uuid(), kind: reviewKindSchema, status: state, subject: z.string(), reference: z.string(),
  actor: z.string(), reason: z.string(), note: z.string(), createdAt: stamp, reviewedAt: stamp.nullable(),
  returnId: z.uuid().nullable(), personId: z.uuid().nullable(), receiptNumber: z.number().int().nullable(),
  expectedPaise: z.number().int().nullable(), foundPaise: z.number().int().nullable(),
  canReview: z.boolean(), canApprove: z.boolean(),
  blocked: z.enum(["STALE", "FINALIZE_FIRST", "OPEN_ISSUES"]).nullable(),
});
export const reviewPageSchema = z.object({ data: z.object({
  summary: z.object({ total: z.number().int(), active: z.number().int(), completed: z.number().int() }), rows: z.array(reviewRowSchema),
}), meta: z.object({ total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }) });
export const reviewDetailSchema = z.object({ data: z.object({
  reason: z.string(), note: z.string(), changes: z.array(z.object({ field: z.string(), before: z.string(), after: z.string() })),
  photoChanged: z.boolean(), currentHasPhoto: z.boolean(), proposedHasPhoto: z.boolean(),
  receipt: z.object({ name: z.string(), anonymous: z.boolean(), amountPaise: z.number().nullable(),
    payment: z.string(), date: z.string(), checked: z.boolean() }).nullable(),
}) });
export const reviewActionSchema = z.strictObject({
  kind: reviewKindSchema, id: z.uuid(), decision: z.enum(["APPROVED", "REJECTED", "RESOLVED"]),
  note: z.string().trim().min(3).max(1000),
}).refine((a) => (a.kind === "PROFILE_EDIT" || a.kind === "RECEIPT_EDIT")
  ? a.decision !== "RESOLVED" && (a.kind !== "PROFILE_EDIT" || a.note.length <= 500) : a.decision === "RESOLVED");
export type ReviewKind = z.infer<typeof reviewKindSchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type ReviewRow = z.infer<typeof reviewRowSchema>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
