import { z } from "zod";

const day = z.union([z.literal(""), z.iso.date()]);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative();
export const donorQuerySchema = z.object({
  search: z.string().trim().max(100).default(""), area: z.string().trim().max(120).default(""),
  from: day.default(""), to: day.default(""),
  kind: z.enum(["ALL", "NAMED", "ANONYMOUS", "UNRECORDED"]).default("ALL"),
  bookType: z.enum(["ALL", "REGULAR", "TOKEN"]).default("ALL"),
  payment: z.enum(["ALL", "CASH", "DIGITAL", "CHEQUE"]).default("ALL"),
  checked: z.enum(["ALL", "CHECKED", "UNCHECKED"]).default("ALL"),
  sort: z.enum(["HIGHEST", "RECENT", "NAME", "REPEAT"]).default("HIGHEST"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { path: ["to"], message: "donorsDateInvalid" });
export const donorRowSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{32}$/), kind: z.enum(["NAMED", "ANONYMOUS", "UNRECORDED"]),
  name: z.string(), phone: z.string(), area: z.string(), state: z.string(),
  collectedPaise: amount, receipts: count, lastDate: z.iso.date(),
});
export const donorSummarySchema = z.object({
  collectedPaise: amount, receipts: count, namedDonors: count, repeatDonors: count,
  anonymousPaise: amount, unrecordedPaise: amount,
  cashPaise: amount, digitalPaise: amount, chequePaise: amount,
  topDonor: z.object({ name: z.string(), collectedPaise: amount, receipts: count }).nullable(),
  topArea: z.object({ name: z.string(), state: z.string(), collectedPaise: amount, receipts: count }).nullable(),
});
const pagination = z.object({ total: count, page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const donorDirectorySchema = z.object({ data: z.object({ summary: donorSummarySchema, rows: z.array(donorRowSchema) }), meta: pagination });
export const donorHistorySchema = z.object({ data: z.array(z.object({
  id: z.uuid(), returnId: z.uuid(), number: z.number().int().positive(),
  bookNumber: z.string(), editionName: z.string(), fundraiser: z.string(),
  date: z.iso.date(), amountPaise: amount, payment: z.enum(["CASH", "DIGITAL", "CHEQUE"]),
  checked: z.boolean(), area: z.string(), state: z.string(),
})), meta: pagination });
export type DonorQuery = z.infer<typeof donorQuerySchema>;
export type DonorRow = z.infer<typeof donorRowSchema>;
export type DonorSummary = z.infer<typeof donorSummarySchema>;
export type DonorDirectory = z.infer<typeof donorDirectorySchema>;
export const defaultDonorFilters = (): Omit<DonorQuery, "page"> => ({
  search: "", area: "", from: "", to: "", kind: "ALL", bookType: "ALL", payment: "ALL", checked: "ALL", sort: "HIGHEST",
});
