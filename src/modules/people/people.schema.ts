import { z } from "zod";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";

export const collectorValuesSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(VALIDATION_PATTERNS.indianMobile),
  email: z.union([z.literal(""), z.email().max(254)]).transform((value) => value.toLowerCase()),
  age: z.string().regex(/^\d{2}$/).refine((value) => Number(value) >= 18 && Number(value) <= 80),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  language: z.enum(["en", "ur"]),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]),
  fatherName: z.string().trim().max(100),
  whatsapp: z.union([z.literal(""), z.string().regex(VALIDATION_PATTERNS.indianMobile)]),
  idProofName: z.string().trim().max(160).refine((value) => !/[\\/]/.test(value)),
  commission: z.string().regex(/^(?:|\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/),
  village: z.string().trim().min(2).max(120),
  postOffice: z.string().trim().min(2).max(120),
  block: z.string().trim().max(120),
  district: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  pin: z.string().regex(/^\d{6}$/),
  remarks: z.string().trim().max(1000),
});
export const collectorRowSchema = collectorValuesSchema.extend({
  id: z.uuid(), code: z.string(), updatedAt: z.iso.datetime(), hasPhoto: z.boolean(),
});
export const collectorQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE", "BLOCKED"]).default("ALL"),
  area: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const collectorSubmissionSchema = z.strictObject({
  values: collectorValuesSchema,
  version: z.iso.datetime().optional(),
  reason: z.string().trim().max(500),
  removePhoto: z.boolean(),
});
export const collectorRequestSchema = z.object({
  id: z.uuid(), collectorId: z.uuid(), collectorName: z.string(), requestedByName: z.string(),
  reason: z.string(), status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  createdAt: z.iso.datetime(), reviewNote: z.string(),
  oldValues: collectorValuesSchema, newValues: collectorValuesSchema,
  photoChanged: z.boolean(), oldHasPhoto: z.boolean(), newHasPhoto: z.boolean(),
});
export const reviewCollectorSchema = z.strictObject({
  decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().min(3).max(500),
});
export const collectorsResponseSchema = z.object({ data: z.array(collectorRowSchema),
  meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export const collectorSaveResponseSchema = z.object({ data: z.object({
  requested: z.boolean(), collector: collectorRowSchema,
}) });
export const collectorRequestsResponseSchema = z.object({ data: z.array(collectorRequestSchema),
  meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });

export type CollectorValues = z.infer<typeof collectorValuesSchema>;
export type CollectorRow = z.infer<typeof collectorRowSchema>;
export type CollectorQuery = z.infer<typeof collectorQuerySchema>;
export type CollectorSubmission = z.infer<typeof collectorSubmissionSchema>;
export type CollectorRequest = z.infer<typeof collectorRequestSchema>;
export type CollectorPage = { collectors: CollectorRow[]; total: number; page: number; pageSize: number };
