import { z } from "zod";
export const navigationKindSchema=z.enum(["FUNDRAISER","USER","BOOK","EDITION","ASSIGNMENT","SUBMISSION","LEFTOVER","RECEIPT","MASTER","RECEIPT_EDIT","PROFILE_EDIT","RECEIPT_ISSUE","BOOK_FLAG","OVERDUE"]);
export const navigationTargetSchema=z.object({
 search:z.string().max(160).optional(),editionId:z.uuid().optional(),bookType:z.enum(["REGULAR","TOKEN"]).optional(),
 masterKind:z.string().max(40).optional(),returnId:z.uuid().optional(),number:z.number().int().positive().optional(),
 reviewKind:z.enum(["RECEIPT_EDIT","PROFILE_EDIT","RECEIPT_ISSUE","BOOK_FLAG"]).optional(),reviewStatus:z.string().max(20).optional(),
});
export const navigationItemSchema=z.object({
 id:z.uuid(),kind:navigationKindSchema,title:z.string(),detail:z.string(),
 href:z.string().regex(/^\/(?!\/)/),target:navigationTargetSchema,
});
export const searchQuerySchema=z.object({q:z.string().trim().min(2).max(80)});
export const searchResponseSchema=z.object({data:z.array(navigationItemSchema)});
export const notificationResponseSchema=z.object({data:z.object({total:z.number().int().nonnegative(),items:z.array(navigationItemSchema)})});
export type NavigationItem=z.infer<typeof navigationItemSchema>;
