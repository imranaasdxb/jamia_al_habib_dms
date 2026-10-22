import { z } from "zod";
import { bookRowSchema } from "@/modules/books/books.schema";

export const leftoversQuerySchema = z.object({ search: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", "AVAILABLE", "ASSIGNED", "HELD"]).default("AVAILABLE"), page: z.coerce.number().int().min(1).max(100000).default(1) });
export const leftoverRowSchema = z.object({ id: z.uuid(), code: z.string(), book: bookRowSchema,
  returnedBy: z.uuid(), returnedByName: z.string(), returnDate: z.iso.date(), receiptFrom: z.number().int(), receiptTo: z.number().int(),
  status: z.enum(["AVAILABLE", "ASSIGNED", "HELD"]), assignable: z.boolean(), updatedAt: z.iso.datetime() });
export const leftoversResponseSchema = z.object({ data: z.array(leftoverRowSchema), meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export type LeftoverRow = z.infer<typeof leftoverRowSchema>;
export type LeftoversQuery = z.infer<typeof leftoversQuerySchema>;
export type LeftoversPage = { rows: LeftoverRow[]; total: number; page: number; pageSize: number };

export const leftoverOptionsQuerySchema = z.object({
  search: z.string().trim().max(100).default(""), areaSearch: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1), areaPage: z.coerce.number().int().min(1).max(100000).default(1),
});
export const leftoverFundraiserSchema = z.object({ id: z.uuid(), fullName: z.string(), code: z.string(), phone: z.string(),
  village: z.string(), district: z.string(), hasPhoto: z.boolean(), photoVersion: z.string(), photoUrl: z.string().nullable().default(null) });
export const leftoverOptionsDataSchema = z.object({
  fundraisers: z.array(leftoverFundraiserSchema),
  areas: z.array(z.object({ id: z.uuid(), nameEn: z.string(), nameUr: z.string() })),
  returnMonths: z.number().int().min(1).max(60),
});
export const leftoverOptionsResponseSchema = z.object({ data: leftoverOptionsDataSchema.extend({
  fundraiserHasMore: z.boolean(), areaHasMore: z.boolean(),
}) });
export type LeftoverFundraiser = z.infer<typeof leftoverFundraiserSchema>;
export type LeftoverOptionsQuery = z.infer<typeof leftoverOptionsQuerySchema>;
