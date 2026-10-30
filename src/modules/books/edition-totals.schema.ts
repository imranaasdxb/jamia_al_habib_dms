import { z } from "zod";

const amount = z.number().int().nonnegative();
const collectionTotalsSchema = z.object({ collectedPaise: amount, commissionPaise: amount });
export const editionCollectionTotalsSchema = z.object({
  total: collectionTotalsSchema, regular: collectionTotalsSchema, token: collectionTotalsSchema,
});
export const editionCollectionTotalsResponseSchema = z.object({ data: editionCollectionTotalsSchema });
export type EditionCollectionTotals = z.infer<typeof editionCollectionTotalsSchema>;
