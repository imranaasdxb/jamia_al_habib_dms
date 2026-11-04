import { z } from "zod";
import { returnQuerySchema } from "@/modules/books/returns.schema";
import { booksQuerySchema } from "@/modules/books/books.schema";

export const bookExportStatuses = ["ALL", "OPEN", "IN_PROGRESS", "OVERDUE", "CLOSED", "REOPENED", "NOT_USED", "FLAGGED"] as const;
export const bookExportQuerySchema = returnQuerySchema.extend({
  source: z.enum(["ASSIGNMENTS", "SUBMISSIONS", "STOCK"]),
  tokenValue: booksQuerySchema.shape.tokenValue,
  stockStatus: booksQuerySchema.shape.status,
  statuses: z.string().max(150).default("ALL").transform((value) => [...new Set(value.split(","))])
    .pipe(z.array(z.enum(bookExportStatuses)).min(1).max(bookExportStatuses.length)),
});
export type BookExportQuery = z.infer<typeof bookExportQuerySchema>;
export type BookExportStatus = typeof bookExportStatuses[number];
