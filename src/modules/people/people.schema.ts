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
// Imported historical records can be incomplete; all new submissions remain strict.
export const collectorStoredValuesSchema = collectorValuesSchema.extend({
  phone: z.union([z.literal(""), collectorValuesSchema.shape.phone]),
  age: z.union([z.literal(""), collectorValuesSchema.shape.age]),
  gender: z.enum(["UNSPECIFIED", "MALE", "FEMALE", "OTHER"]),
  village: z.string().trim().max(120), postOffice: z.string().trim().max(120),
  district: z.string().trim().max(120), state: z.string().trim().max(120),
  pin: z.union([z.literal(""), collectorValuesSchema.shape.pin]),
});
export const collectorRowSchema = collectorStoredValuesSchema.extend({
  id: z.uuid(), code: z.string(), updatedAt: z.iso.datetime(), hasPhoto: z.boolean(),
  leftoverEligible: z.boolean(), collectionAreaName: z.string().default(""),
});
export const collectorAssignmentOptionSchema = collectorRowSchema.pick({
  id: true, fullName: true, code: true, age: true, village: true, commission: true,
  status: true, hasPhoto: true, leftoverEligible: true,
}).extend({ photoVersion: z.iso.datetime() });
export const collectorAssignmentOptionsSchema = z.object({
  data: z.array(collectorAssignmentOptionSchema),
  meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }),
});
export type CollectorAssignmentOption = z.infer<typeof collectorAssignmentOptionSchema>;

export const collectorDeleteSchema = z.strictObject({ version: z.iso.datetime() });
export const collectorDeleteResponseSchema = z.object({ data: z.object({ id: z.uuid(), photoCleanupPending: z.boolean() }) });
export const collectorEligibilitySchema = z.strictObject({ leftoverEligible: z.boolean(), version: z.iso.datetime() });
export const collectorEligibilityResponseSchema = z.object({ data: collectorRowSchema });
export const collectorStatusSchema = z.strictObject({
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]), version: z.iso.datetime(),
});
export const collectorPatchSchema = z.union([collectorEligibilitySchema, collectorStatusSchema]);
export const collectorQuerySchema = z.object({
  view: z.enum(["FULL", "ASSIGNMENT"]).default("FULL"),
  search: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE", "BLOCKED"]).default("ALL"),
  area: z.string().trim().max(100).default(""),
  leftoverEligible: z.enum(["ALL", "YES"]).default("ALL"),
  sort: z.enum(["CODE_ASC", "NAME_ASC"]).default("CODE_ASC"),
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
  oldValues: collectorStoredValuesSchema, newValues: collectorValuesSchema,
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
