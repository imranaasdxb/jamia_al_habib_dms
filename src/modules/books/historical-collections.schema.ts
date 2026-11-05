import { z } from "zod";

export const historicalCollectionQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  collectorId: z.union([z.literal(""), z.uuid()]).default(""),
  editionId: z.union([z.literal(""), z.uuid()]).default(""),
  bookType: z.enum(["ALL", "REGULAR", "TOKEN"]).default("ALL"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
const amount = z.number().int().nullable();
export const historicalCollectionsResponseSchema = z.object({
  data: z.array(z.object({
    sourceRow: z.number().int(), fundraiser: z.string(), code: z.string(), book: z.string(), edition: z.string(),
    originalBook: z.string(), receiptFrom: z.number().int().nullable(), receiptTo: z.number().int().nullable(),
    assignmentId: z.uuid().nullable(), returnId: z.uuid().nullable(), receiptNumber: z.number().int().nullable(),
    linkStatus: z.enum(["LINKED", "RECORDED"]),
    bookType: z.enum(["REGULAR", "TOKEN", "UNKNOWN"]), tokenValuePaise: amount,
    date: z.iso.date().nullable(), area: z.string(), condition: z.string(),
    collectedPaise: amount, commissionPaise: amount,
  })),
  meta: z.object({ total: z.number().int(), page: z.number().int(), pageSize: z.number().int(),
    collectedPaise: z.number().int(), commissionPaise: z.number().int() }),
});
export type HistoricalCollectionQuery = z.infer<typeof historicalCollectionQuerySchema>;
