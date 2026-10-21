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
