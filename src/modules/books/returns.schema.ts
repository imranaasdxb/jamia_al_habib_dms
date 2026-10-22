import { z } from "zod";
import { bookRowSchema } from "@/modules/books/books.schema";
import { assignmentRowSchema } from "@/modules/books/assignments.schema";

const money = z.number().int().min(0).max(999_999_999_999);
export const receiptExceptionSchema = z.strictObject({ receiptNumber: z.number().int().positive().max(2147483647),
  status: z.enum(["CANCELLED", "TORN", "LOST"]), reasonId: z.uuid() });
export const returnValuesSchema = z.strictObject({ caseId: z.uuid(), returnDate: z.iso.date(),
  totalPaise: money, cashPaise: money, digitalPaise: money, receiptSumPaise: money,
  receiptsUsed: z.number().int().min(0).max(2147483647), lastUsed: z.number().int().positive().max(2147483647).nullable(),
  commissionBasisPoints: z.number().int().min(0).max(10000), commissionGiven: z.boolean(),
  exceptions: z.array(receiptExceptionSchema).max(1000), outcome: z.enum(["CLOSED", "PARTLY_USED", "FLAGGED"]),
  flagReasonId: z.uuid().nullable(), expectedPaise: money.nullable(), foundPaise: money.nullable(), remarks: z.string().trim().max(1000),
}).superRefine((values, ctx) => {
  if (values.cashPaise + values.digitalPaise !== values.totalPaise) ctx.addIssue({ code: "custom", path: ["cashPaise"], message: "returnsCashMismatch" });
  if (commissionPaise(values.totalPaise, values.commissionBasisPoints) > values.totalPaise) ctx.addIssue({ code: "custom", path: ["commissionBasisPoints"], message: "returnsCommissionInvalid" });
  if (new Set(values.exceptions.map((row) => row.receiptNumber)).size !== values.exceptions.length
    || values.exceptions.length > values.receiptsUsed) ctx.addIssue({ code: "custom", path: ["exceptions"], message: "returnsExceptionInvalid" });
  if (values.outcome === "FLAGGED" && (!values.flagReasonId || values.expectedPaise === null || values.foundPaise === null || !values.remarks)) {
    ctx.addIssue({ code: "custom", path: ["flagReasonId"], message: "returnsFlagRequired" });
  }
  if (values.outcome !== "FLAGGED" && (values.flagReasonId !== null || values.expectedPaise !== null || values.foundPaise !== null)) {
    ctx.addIssue({ code: "custom", path: ["flagReasonId"], message: "returnsInvalid" });
  }
});
export const returnSubmissionSchema = z.strictObject({ operationId: z.uuid(), values: returnValuesSchema });
export const bookLossSubmissionSchema = z.strictObject({ action: z.literal("MARK_BOOK_LOST"), caseId: z.uuid(), reason: z.string().trim().min(3).max(1000) });
export const bookLossResultSchema = z.object({ caseId: z.uuid(), bookId: z.uuid(), assignmentId: z.uuid() });
export const bookLossResponseSchema = z.object({ data: bookLossResultSchema });
export type BookLossSubmission = z.infer<typeof bookLossSubmissionSchema>;
export const returnQuerySchema = z.object({ search: z.string().trim().max(100).default(""),
  collectorId: z.union([z.literal(""), z.uuid()]).default(""),
  overdue: z.enum(["ALL", "OVERDUE"]).default("ALL"),
  tab: z.enum(["OPEN", "RETURNED"]).default("OPEN"), page: z.coerce.number().int().min(1).max(100000).default(1) });
export const openReturnCaseSchema = z.object({ id: z.uuid(), source: z.enum(["NEW", "LEFTOVER"]), sourceCode: z.string(), book: bookRowSchema, assignment: assignmentRowSchema,
  commissionBasisPoints: z.number().int().nullable(), hasPhoto: z.boolean(), submissionId: z.uuid().nullable() });
export const openReturnsResponseSchema = z.object({ data: z.array(openReturnCaseSchema), meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export const storedExceptionSchema = receiptExceptionSchema.extend({ reasonEn: z.string(), reasonUr: z.string() });
export const returnRowSchema = z.object({ id: z.uuid(), number: z.string(), caseId: z.uuid(), bookId: z.uuid(), assignmentId: z.uuid(),
  sourceCode: z.string(),
  bookNumber: z.string(), collectorName: z.string(), returnDate: z.iso.date(), outcome: z.enum(["CLOSED", "PARTLY_USED", "FLAGGED"]),
  totalPaise: money, cashPaise: money, digitalPaise: money, receiptSumPaise: money,
  receiptsUsed: z.number().int(), receiptFrom: z.number().int(), receiptTo: z.number().int(), lastUsed: z.number().int().nullable(),
  remainingReceipts: z.number().int(), commissionBasisPoints: z.number().int(), commissionPaise: money,
  netPaise: money, cashHandoverPaise: z.number().int(), commissionGiven: z.boolean(),
  exceptions: z.array(storedExceptionSchema), flagReasonId: z.uuid().nullable(), flagReasonEn: z.string(), flagReasonUr: z.string(), expectedPaise: money.nullable(), foundPaise: money.nullable(),
  remarks: z.string(), checkedByName: z.string(), receiptEntryStatus: z.enum(["PENDING", "DRAFT", "RECONCILED", "FLAGGED"]), createdAt: z.iso.datetime() });
export const returnsResponseSchema = z.object({ data: z.array(returnRowSchema), meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export const returnSavedSchema = z.object({ data: z.object({ row: returnRowSchema, book: bookRowSchema, replayed: z.boolean() }) });
export type ReturnValues = z.infer<typeof returnValuesSchema>;
export type ReturnSubmission = z.infer<typeof returnSubmissionSchema>;
export type ReturnQuery = z.infer<typeof returnQuerySchema>;
export type OpenReturnCase = z.infer<typeof openReturnCaseSchema>;
export type ReturnRow = z.infer<typeof returnRowSchema>;
export type ReceiptException = z.infer<typeof receiptExceptionSchema>;
export type OpenReturnsPage = { rows: OpenReturnCase[]; total: number; page: number; pageSize: number };
export type ReturnsPage = { rows: ReturnRow[]; total: number; page: number; pageSize: number };

// Round to the nearest rupee using integer arithmetic, including half-rupee ties.
export function commissionPaise(total: number, basisPoints: number) {
  return Number((BigInt(total) * BigInt(basisPoints) + BigInt(500000)) / BigInt(1000000) * BigInt(100));
}
export function parseMoney(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return result <= 999_999_999_999 ? result : null;
}
export function returnChecks(values: ReturnValues, book: OpenReturnCase["book"]) {
  const rangeUsed = values.lastUsed === null ? 0 : values.lastUsed - book.receiptFrom + 1;
  const remaining = book.totalReceipts - rangeUsed;
  const rangeValid = values.lastUsed === null ? values.receiptsUsed === 0 && values.exceptions.length === 0
    : values.lastUsed >= book.receiptFrom && values.lastUsed <= book.receiptTo;
  const exceptionsValid = values.exceptions.every((row) => values.lastUsed !== null && row.receiptNumber >= book.receiptFrom && row.receiptNumber <= values.lastUsed);
  const amountMatch = values.totalPaise === values.receiptSumPaise;
  const countMatch = values.receiptsUsed === rangeUsed;
  const tokenMatch = book.bookType !== "TOKEN" || values.receiptSumPaise === (values.receiptsUsed - values.exceptions.length) * (book.tokenValuePaise ?? 0);
  const moneyHasReceipts = (values.totalPaise === 0 && values.receiptSumPaise === 0) || (rangeUsed > 0 && values.receiptsUsed > 0);
  const matched = amountMatch && countMatch && tokenMatch && moneyHasReceipts && !values.exceptions.some((row) => row.status === "LOST" || row.status === "TORN");
  return { rangeUsed, remaining, rangeValid, exceptionsValid, amountMatch, countMatch, tokenMatch, moneyHasReceipts, matched };
}
export const displayMoney = (paise: number, language = "en") => new Intl.NumberFormat(language === "ur" ? "ur-IN" : "en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2,
}).format(paise / 100);
