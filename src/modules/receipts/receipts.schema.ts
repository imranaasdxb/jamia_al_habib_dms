import { z } from "zod";
import { returnRowSchema } from "@/modules/books/returns.schema";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";

const id = z.union([z.literal(""), z.uuid()]);
const day = z.union([z.literal(""), z.iso.date()]);
const money = z.number().int().min(0).max(999_999_999_999).nullable();
export const receiptValuesSchema = z.strictObject({
  status: z.enum(["VALID", "CANCELLED", "TORN", "LOST", "BLANK"]), date: day, reasonId: id,
  anonymous: z.boolean(), donorName: z.string().trim().max(120), parentage: z.enum(["S/O", "D/O", "W/O"]), parentName: z.string().trim().max(120),
  phone: z.string().regex(/^\d{0,10}$/), email: z.union([z.literal(""), z.email().max(254)]), marhoomName: z.string().trim().max(120),
  village: z.string().trim().max(160), postOffice: z.string().trim().max(120), block: z.string().trim().max(120),
  district: z.string().trim().max(120), state: z.string().trim().max(120), pin: z.string().regex(/^\d{0,6}$/),
  amountPaise: money, amountWords: z.string().trim().max(500), paymentMode: z.enum(["CASH", "DIGITAL", "CHEQUE"]),
  upiAppId: id, reference: z.string().trim().max(100).regex(/^[a-zA-Z0-9/_-]*$/).transform((value) => value.toUpperCase()), transactionDate: day,
  chequeNumber: z.string().trim().max(30), bankId: id, branch: z.string().trim().max(160), chequeDate: day,
  heads: z.array(z.strictObject({ categoryId: id, headId: id, purpose: z.string().trim().max(300), amountPaise: money })).max(20),
  receiverName: z.string().trim().max(120), responsibility: z.string().trim().max(120), donorSigned: z.boolean(), receiverSigned: z.boolean(), remarks: z.string().trim().max(1000),
});
export const receiptRecordSchema = z.object({ id: z.uuid(), number: z.number().int(), version: z.number().int(), checked: z.boolean(), values: receiptValuesSchema,
  labels: z.record(z.string(), z.object({ nameEn: z.string(), nameUr: z.string(), needsDetail: z.boolean().default(false) })), hasPhoto: z.boolean(), updatedAt: z.iso.datetime(), entryByName: z.string() });
export const receiptHeaderSchema = z.object({ returned: returnRowSchema, assignmentDate: z.iso.date(), editionEn: z.string(), editionUr: z.string(),
  collectorId: z.uuid(), collectorCode: z.string(), phone: z.string(), address: z.string(), hasPhoto: z.boolean(),
  assignmentNumber: z.string(), expectedReturnDate: z.iso.date(), submissionPending: z.boolean(),
  bookType: z.enum(["REGULAR", "TOKEN"]), tokenValuePaise: z.number().int().nullable(), version: z.number().int(), finalized: z.boolean() });
export const receiptEditSchema = z.object({ id: z.uuid(), returnId: z.uuid(), receiptId: z.uuid(), receiptNumber: z.number().int(), requestedBy: z.uuid(), requestedByName: z.string(),
  reason: z.string(), baseVersion: z.number().int(), status: z.enum(["PENDING", "APPROVED", "REJECTED", "USED"]), reviewNote: z.string(), createdAt: z.iso.datetime() });
export const receiptIssueSchema = z.object({ id: z.uuid(), returnId: z.uuid(), receiptNumber: z.number().int(), raisedByName: z.string(), reason: z.string(),
  status: z.enum(["OPEN", "RESOLVED"]), resolution: z.string(), createdAt: z.iso.datetime() });
export const receiptFlagSchema = z.object({ id: z.uuid(), returnId: z.uuid(), bookNumber: z.string(), collectorName: z.string(), reason: z.string(),
  status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED"]), expectedPaise: z.number(), foundPaise: z.number() });
export const receiptWorkflowSchema = z.object({ data: z.object({ requests: z.array(receiptEditSchema), issues: z.array(receiptIssueSchema), flags: z.array(receiptFlagSchema) }) });
export const receiptTotalsSchema = z.object({ saved: z.number().int(), valid: z.number().int(), total: z.number().int(), cash: z.number().int(), digital: z.number().int(), cheque: z.number().int() });
export const receiptBookSchema = z.object({ header: receiptHeaderSchema, totals: receiptTotalsSchema,
  checkedCount: z.number().int(), requests: z.array(receiptEditSchema), issues: z.array(receiptIssueSchema),
  rows: z.array(z.object({ number: z.number().int(), record: receiptRecordSchema.nullable() })), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });
export const receiptBookResponseSchema = z.object({ data: receiptBookSchema });
export const receiptRecordResponseSchema = z.object({ data: receiptRecordSchema });
export const receiptQueueSchema = z.object({ data: z.array(receiptHeaderSchema), meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export const receiptQuerySchema = z.object({ search: z.string().trim().max(100).default(""), status: z.enum(["PENDING", "FINALIZED", "ALL"]).default("PENDING"), page: z.coerce.number().int().min(1).max(100000).default(1) });
export const receiptActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("SAVE"), number: z.number().int().positive().max(2147483647), version: z.number().int().positive().nullable(), values: receiptValuesSchema,
    checked: z.boolean().default(false),
    page: z.number().int().positive().max(100000000) }),
  z.strictObject({ action: z.literal("FINALIZE"), version: z.number().int().min(0), page: z.number().int().positive().max(100000000) }),
]);
export const receiptWorkflowActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("RAISE_ISSUE"), returnId: z.uuid(), number: z.number().int().positive().max(2147483647), reason: z.string().trim().min(3).max(1000) }),
  z.strictObject({ action: z.literal("REQUEST_EDIT"), returnId: z.uuid(), number: z.number().int().positive().max(2147483647), reason: z.string().trim().min(3).max(1000) }),
  z.strictObject({ action: z.literal("REVIEW_EDIT"), id: z.uuid(), decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().min(3).max(1000) }),
  z.strictObject({ action: z.literal("RESOLVE_ISSUE"), id: z.uuid(), reason: z.string().trim().min(3).max(1000) }),
  z.strictObject({ action: z.literal("RESOLVE_BOOK_FLAG"), id: z.uuid(), reason: z.string().trim().min(3).max(1000) }),
]);
export type ReceiptValues = z.infer<typeof receiptValuesSchema>;
export type ReceiptRecord = z.infer<typeof receiptRecordSchema>;
export type ReceiptHeader = z.infer<typeof receiptHeaderSchema>;
export type ReceiptBook = z.infer<typeof receiptBookSchema>;
export type ReceiptAction = z.infer<typeof receiptActionSchema>;
export type ReceiptQuery = z.infer<typeof receiptQuerySchema>;
export type ReceiptQueue = { rows: ReceiptHeader[]; total: number; page: number; pageSize: number };
export const donorSuggestionSchema = receiptValuesSchema.pick({ donorName: true, parentage: true, parentName: true, phone: true, email: true,
  village: true, postOffice: true, block: true, district: true, state: true, pin: true });
export const donorSuggestionsSchema = z.object({ data: z.array(donorSuggestionSchema) });
export type DonorSuggestion = z.infer<typeof donorSuggestionSchema>;

export function receiptComplete(value: ReceiptValues, header: ReceiptHeader) {
  if (!value.date || value.date < header.assignmentDate || value.date > header.returned.returnDate) return false;
  if (value.status !== "VALID") return value.amountPaise === 0 && Boolean(value.reasonId) && value.heads.length === 0;
  if (value.amountPaise === null || value.amountPaise <= 0 || !value.amountWords || value.receiverName.length < 2
    || (!value.anonymous && (value.donorName.length < 2 || value.parentName.length < 2 || !VALIDATION_PATTERNS.indianMobile.test(value.phone)))
    || (value.phone !== "" && !VALIDATION_PATTERNS.indianMobile.test(value.phone)) || value.village.length < 2 || value.postOffice.length < 2
    || value.district.length < 2 || value.state.length < 2 || !/^\d{6}$/.test(value.pin)) return false;
  if (header.bookType === "TOKEN" && value.amountPaise !== header.tokenValuePaise) return false;
  if (!value.heads.length || value.heads.some((row) => !row.categoryId || !row.headId || row.amountPaise === null || row.amountPaise <= 0)
    || value.heads.reduce((sum, row) => sum + (row.amountPaise ?? 0), 0) !== value.amountPaise) return false;
  if (value.paymentMode === "DIGITAL" && (!value.upiAppId || value.reference.length < 3)) return false;
  if (value.paymentMode === "CHEQUE" && (!/^\d{6}$/.test(value.chequeNumber) || !value.bankId || value.branch.length < 2 || !value.chequeDate)) return false;
  return true;
}
export function newReceipt(number: number, header: ReceiptHeader): ReceiptValues {
  const exception = header.returned.exceptions.find((row) => row.receiptNumber === number);
  const amount = exception ? 0 : header.tokenValuePaise;
  return { status: exception?.status ?? "VALID", date: header.returned.returnDate, reasonId: exception?.reasonId ?? "", anonymous: false,
    donorName: "", parentage: "S/O", parentName: "", phone: "", email: "", marhoomName: "", village: "", postOffice: "", block: "", district: "", state: "Odisha", pin: "",
    amountPaise: amount, amountWords: amount === null ? "" : amountInWords(amount), paymentMode: "CASH", upiAppId: "", reference: "", transactionDate: "", chequeNumber: "", bankId: "", branch: "", chequeDate: "",
    heads: exception ? [] : [{ categoryId: "", headId: "", purpose: "", amountPaise: amount }], receiverName: header.returned.collectorName, responsibility: "", donorSigned: false, receiverSigned: false, remarks: "" };
}
const small = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
function words(value: number): string {
  if (value < 20) return small[value] ?? "";
  if (value < 100) return `${["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"][Math.floor(value / 10)]}${value % 10 ? ` ${words(value % 10)}` : ""}`;
  const scale = value >= 10000000 ? 10000000 : value >= 100000 ? 100000 : value >= 1000 ? 1000 : 100;
  const label = scale === 10000000 ? "Crore" : scale === 100000 ? "Lakh" : scale === 1000 ? "Thousand" : "Hundred";
  return `${words(Math.floor(value / scale))} ${label}${value % scale ? ` ${words(value % scale)}` : ""}`;
}
export function amountInWords(paise: number) { return `Rupees ${words(Math.floor(paise / 100))}${paise % 100 ? ` and ${words(paise % 100)} Paise` : ""} Only`; }
