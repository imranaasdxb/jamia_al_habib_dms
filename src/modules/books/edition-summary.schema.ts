import { z } from "zod";
import { BOOK_STATUSES } from "@/modules/books/books.schema";

const amount = z.number().int().nonnegative();
export const editionSummaryQuerySchema = z.object({
  search: z.string().trim().max(100).default(""), status: z.enum(["ALL", ...BOOK_STATUSES]).default("ALL"),
  page: z.coerce.number().int().min(1).max(100000).default(1), view: z.enum(["overview", "books"]).default("overview"),
});
export const editionBookSummarySchema = z.object({
  id: z.uuid(), number: z.string(), ordinal: z.number().int().nullable(),
  receiptFrom: z.number().int(), receiptTo: z.number().int(), status: z.enum(BOOK_STATUSES),
  fundraiser: z.string().nullable(), submissionId: z.uuid().nullable(),
  entered: amount, collectedPaise: amount, cashPaise: amount, digitalPaise: amount, chequePaise: amount,
  commissionPaise: amount, netPaise: z.number().int(),
});
export const editionBookPageSchema = z.object({ rows: z.array(editionBookSummarySchema), total: amount,
  page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const editionOverviewSchema = z.object({
  edition: z.object({ id: z.uuid(), code: z.string(), nameEn: z.string(), nameUr: z.string(),
    number: z.number().int().nullable(), bookType: z.enum(["REGULAR", "TOKEN"]).nullable(),
    tokenValuePaise: z.number().int().nullable(), printingYear: z.number().int().nullable() }),
  totals: z.object({ books: amount, inStock: amount, assigned: amount, partlyUsed: amount, closed: amount, flagged: amount, lost: amount,
    receipts: amount, entered: amount, checked: amount, cancelled: amount, damaged: amount,
    collectedPaise: amount, finalizedPaise: amount, cashPaise: amount, digitalPaise: amount, chequePaise: amount, commissionPaise: amount, netPaise: z.number().int() }),
  books: editionBookPageSchema,
});
export const editionOverviewResponseSchema = z.object({ data: editionOverviewSchema });
export const editionBookPageResponseSchema = z.object({ data: editionBookPageSchema });
export type EditionOverview = z.infer<typeof editionOverviewSchema>;
export type EditionBookSummary = z.infer<typeof editionBookSummarySchema>;
export type EditionSummaryQuery = z.infer<typeof editionSummaryQuerySchema>;
