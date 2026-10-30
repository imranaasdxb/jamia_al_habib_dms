import { z } from "zod";

const day = z.union([z.literal(""), z.iso.date()]);
const id = z.union([z.literal(""), z.uuid()]);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative();
export const donationStatusSchema = z.enum(["VALID", "CANCELLED", "TORN", "LOST", "BLANK"]);
export const donationQuerySchema = z.object({
  search: z.string().trim().max(100).default(""), area: z.string().trim().max(120).default(""),
  from: day.default(""), to: day.default(""),
  bookType: z.enum(["ALL", "REGULAR", "TOKEN"]).default("ALL"), editionId: id.default(""),
  categoryId: id.default(""), headId: id.default(""),
  payment: z.enum(["ALL", "CASH", "DIGITAL", "CHEQUE"]).default("ALL"),
  status: z.enum(["ALL", ...donationStatusSchema.options]).default("VALID"),
  stage: z.enum(["ALL", "DRAFT", "FINALIZED", "FLAGGED"]).default("ALL"),
  checked: z.enum(["ALL", "CHECKED", "UNCHECKED"]).default("ALL"),
  kind: z.enum(["ALL", "NAMED", "ANONYMOUS", "UNRECORDED"]).default("ALL"),
  sort: z.enum(["RECENT", "OLDEST", "HIGHEST"]).default("RECENT"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine(q => !q.from || !q.to || q.from <= q.to, { path: ["to"], message: "Invalid date range" });
const name = z.object({ nameEn: z.string(), nameUr: z.string() });
export const donationRowSchema = z.object({
  id: z.uuid(), returnId: z.uuid(), number: count, date: z.iso.date(), version: count,
  status: donationStatusSchema, amountPaise: amount.nullable(), checked: z.boolean(),
  payment: z.enum(["CASH", "DIGITAL", "CHEQUE"]),
  kind: z.enum(["NAMED", "ANONYMOUS", "UNRECORDED"]), name: z.string(), phone: z.string(),
  area: z.string(), state: z.string(), finalized: z.boolean(), flagged: z.boolean(),
  book: z.object({ number: z.string(), ordinal: z.number().int().nullable(), editionNumber: z.number().int().nullable(),
    editionEn: z.string(), editionUr: z.string(), type: z.enum(["REGULAR", "TOKEN"]),
    tokenValuePaise: amount.nullable(), receiptFrom: count }),
  fundraiser: z.object({ name: z.string(), code: z.string() }),
  headCount: count, head: name, category: name, historical: z.boolean(),
});
export const donationPageSchema = z.object({ data: z.object({
  summary: z.object({
    collectedPaise: amount, cashPaise: amount, digitalPaise: amount, chequePaise: amount,
    draftPaise: amount, finalizedPaise: amount, receipts: count, valid: count,
    checked: count, cancelled: count, damaged: count,
  }), rows: z.array(donationRowSchema),
}), meta: z.object({ total: count, page: z.number().int().positive(), pageSize: z.number().int().positive() }) });
export const donationOptionsSchema = z.object({ data: z.object({
  editions: z.array(z.object({ id: z.uuid(), nameEn: z.string(), nameUr: z.string(),
    bookType: z.enum(["REGULAR", "TOKEN"]), tokenValuePaise: amount.nullable() })),
  categories: z.array(name.extend({ id: z.uuid(), heads: z.array(name.extend({ id: z.uuid() })) })),
}) });
export const donationDetailSchema = z.object({ data: z.object({
  number: count, returnId: z.uuid(), donorName: z.string(), anonymous: z.boolean(), phone: z.string(),
  address: z.string(), amountPaise: amount.nullable(), amountWords: z.string(),
  status: donationStatusSchema, reason: name, payment: z.enum(["CASH", "DIGITAL", "CHEQUE"]),
  reference: z.string(), transactionDate: day, chequeNumber: z.string(), chequeDate: day,
  branch: z.string(), bank: name, upiApp: name, entryBy: z.string(), remarks: z.string(),
  checked: z.boolean(), finalized: z.boolean(), openIssues: count, pendingEdits: count,
  heads: z.array(name.extend({ category: name, purpose: z.string(), amountPaise: amount.nullable() })),
}) });
export type DonationQuery = z.infer<typeof donationQuerySchema>;
export type DonationRow = z.infer<typeof donationRowSchema>;
export const defaultDonationFilters: DonationQuery = {
  search: "", area: "", from: "", to: "", bookType: "ALL", editionId: "", categoryId: "", headId: "",
  payment: "ALL", status: "VALID", stage: "ALL", checked: "ALL", kind: "ALL", sort: "RECENT", page: 1,
};
