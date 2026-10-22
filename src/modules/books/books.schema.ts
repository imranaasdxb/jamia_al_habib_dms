import { z } from "zod";

const receiptNumber = z.string().regex(/^\d{1,10}$/).refine((value) => Number(value) >= 1 && Number(value) <= 2147483647);
const common = {
  stockDate: z.iso.date(), editionId: z.uuid(), bookType: z.enum(["REGULAR", "TOKEN"]),
  tokenValue: z.enum(["", "10", "20", "50"]), remarks: z.string().trim().max(1000),
};
function tokenIssue(values: { bookType: "REGULAR" | "TOKEN"; tokenValue: string }, context: z.RefinementCtx) {
  if ((values.bookType === "TOKEN" && !values.tokenValue) || (values.bookType === "REGULAR" && values.tokenValue)) {
    context.addIssue({ code: "custom", path: ["tokenValue"], message: "booksInvalidToken" });
  }
}
export const singleBookSchema = z.strictObject({ ...common,
  bookNumber: z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/).transform((value) => value.toUpperCase()),
  receiptFrom: receiptNumber, receiptTo: receiptNumber,
}).superRefine((values, context) => {
  tokenIssue(values, context);
  if (Number(values.receiptTo) < Number(values.receiptFrom)) context.addIssue({ code: "custom", path: ["receiptTo"], message: "booksInvalidRange" });
});
export const bulkBooksSchema = z.strictObject({ ...common,
  startingBookNumber: z.string().trim().regex(/^\d{1,20}$/),
  bookCount: z.string().regex(/^\d{1,3}$/).refine((value) => Number(value) >= 1 && Number(value) <= 150),
  receiptsPerBook: receiptNumber, firstReceipt: receiptNumber,
}).superRefine((values, context) => {
  tokenIssue(values, context);
  if (Number(values.firstReceipt) + Number(values.bookCount) * Number(values.receiptsPerBook) - 1 > 2147483647) {
    context.addIssue({ code: "custom", path: ["firstReceipt"], message: "booksInvalidRange" });
  }
});
export const bookSubmissionSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("SINGLE"), operationId: z.uuid(), values: singleBookSchema }),
  z.strictObject({ mode: z.literal("BULK"), operationId: z.uuid(), values: bulkBooksSchema }),
]);
export const BOOK_STATUSES = ["IN_STOCK", "ASSIGNED", "FLAGGED", "CLOSED", "PARTLY_USED", "LEFTOVER_ASSIGNED", "LOST"] as const;
export const bookRowSchema = z.object({ id: z.uuid(), bookNumber: z.string(), stockDate: z.iso.date(), editionId: z.uuid(),
  editionNameEn: z.string(), editionNameUr: z.string(), bookType: z.enum(["REGULAR", "TOKEN"]),
  tokenValuePaise: z.number().int().nullable(), receiptFrom: z.number().int(), receiptTo: z.number().int(),
  totalReceipts: z.number().int(), faceValuePaise: z.number().int().nullable(), status: z.enum(BOOK_STATUSES),
  remarks: z.string(), entryByName: z.string(), updatedAt: z.iso.datetime() });
export const booksQuerySchema = z.object({ search: z.string().trim().max(100).default(""),
  editionId: z.union([z.literal(""), z.uuid()]).default(""), bookType: z.enum(["ALL", "REGULAR", "TOKEN"]).default("ALL"),
  tokenValue: z.enum(["", "10", "20", "50"]).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) });
export const booksResponseSchema = z.object({ data: z.array(bookRowSchema),
  meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number() }) });
export const booksSavedSchema = z.object({ data: z.object({ rows: z.array(bookRowSchema), replayed: z.boolean() }) });
export const bookEntryQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) });
export const bookEntryDataSchema = z.object({
  rows: z.array(bookRowSchema.pick({ id: true, bookNumber: true, receiptFrom: true, receiptTo: true })),
  latestId: z.uuid().nullable(), nextReceipt: z.number().int().min(1).max(2147483647).nullable(),
  hasMore: z.boolean(),
});
export const bookEntryResponseSchema = z.object({ data: bookEntryDataSchema });
export type SingleBookValues = z.infer<typeof singleBookSchema>;
export type BulkBooksValues = z.infer<typeof bulkBooksSchema>;
export type BookSubmission = z.infer<typeof bookSubmissionSchema>;
export type BookRow = z.infer<typeof bookRowSchema>;
export type BooksQuery = z.infer<typeof booksQuerySchema>;
export type BooksPage = { rows: BookRow[]; total: number; page: number; pageSize: number };

const stockEditorValuesSchema = z.strictObject({ ...common, bookNumber: z.string(), receiptFrom: z.string(), receiptTo: z.string(),
  startingBookNumber: z.string(), bookCount: z.string(), receiptsPerBook: z.string(), firstReceipt: z.string() });
export type StockEditorValues = z.infer<typeof stockEditorValuesSchema>;
export function stockSubmission(mode: "SINGLE" | "BULK", operationId: string, values: StockEditorValues): BookSubmission {
  const fields = { stockDate: values.stockDate, editionId: values.editionId, bookType: values.bookType,
    tokenValue: values.tokenValue, remarks: values.remarks };
  return mode === "BULK" ? { mode, operationId, values: bulkBooksSchema.parse({ ...fields,
    startingBookNumber: values.startingBookNumber, bookCount: values.bookCount, receiptsPerBook: values.receiptsPerBook, firstReceipt: values.firstReceipt }) }
    : { mode, operationId, values: singleBookSchema.parse({ ...fields, bookNumber: values.bookNumber, receiptFrom: values.receiptFrom, receiptTo: values.receiptTo }) };
}
export function stockEditorSchema(mode: "SINGLE" | "BULK") {
  return stockEditorValuesSchema.superRefine((values, context) => {
    try { stockSubmission(mode, "", values); }
    catch (error) {
      if (error instanceof z.ZodError) for (const issue of error.issues) context.addIssue({ ...issue });
      else context.addIssue({ code: "custom", message: "booksInvalid" });
    }
  });
}

export function bulkBookRows(values: BulkBooksValues) {
  return Array.from({ length: Number(values.bookCount) }, (_, index): SingleBookValues => ({
    stockDate: values.stockDate, editionId: values.editionId, bookType: values.bookType, tokenValue: values.tokenValue, remarks: values.remarks,
    bookNumber: (BigInt(values.startingBookNumber) + BigInt(index)).toString().padStart(values.startingBookNumber.length, "0"),
    receiptFrom: String(Number(values.firstReceipt) + index * Number(values.receiptsPerBook)),
    receiptTo: String(Number(values.firstReceipt) + (index + 1) * Number(values.receiptsPerBook) - 1),
  }));
}
