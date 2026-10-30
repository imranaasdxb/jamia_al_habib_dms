import { z } from "zod";
const day=z.union([z.literal(""),z.iso.date()]);
export const reportQuerySchema=z.object({
 view:z.enum(["EDITIONS","BOOKS","FUNDRAISERS","HEADS","AREAS","PAYMENTS"]).default("EDITIONS"),
 bookType:z.enum(["ALL","REGULAR","TOKEN"]).default("ALL"),
 editionId:z.union([z.literal(""),z.uuid()]).default(""),
 stage:z.enum(["ALL","DRAFT","FINALIZED","RECONCILED","FLAGGED"]).default("ALL"),
 from:day.default(""),to:day.default(""),search:z.string().trim().max(100).default(""),
 sort:z.enum(["AMOUNT","NAME"]).default("AMOUNT"),page:z.coerce.number().int().min(1).max(100000).default(1),
}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:"Invalid date range"});
const amount=z.number().int();
export const reportRowSchema=z.object({id:z.string(),name:z.string(),detail:z.string(),receipts:z.number().int(),books:z.number().int(),
 collectedPaise:amount,commissionPaise:amount,netPaise:amount,cashPaise:amount,digitalPaise:amount,chequePaise:amount});
export const reportPageSchema=z.object({data:z.object({
 totals:z.object({collectedPaise:amount,commissionPaise:amount,netPaise:amount,draftPaise:amount,finalizedPaise:amount,
 cashPaise:amount,digitalPaise:amount,chequePaise:amount,receipts:z.number().int(),books:z.number().int(),checked:z.number().int()}),
 rows:z.array(reportRowSchema),
}),meta:z.object({total:z.number().int(),page:z.number().int(),pageSize:z.number().int()})});
export const reportOptionsSchema=z.object({data:z.array(z.object({id:z.uuid(),name:z.string(),bookType:z.enum(["REGULAR","TOKEN"]),tokenValuePaise:amount.nullable()}))});
export type ReportQuery=z.infer<typeof reportQuerySchema>;
