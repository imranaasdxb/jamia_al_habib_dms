import { z } from "zod";

const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative();
export const dashboardQuerySchema = z.object({
  period: z.enum(["allTime", "thisYear", "thisMonth", "lastMonth"]).default("allTime"),
  interval: z.enum(["monthly", "weekly", "yearly"]).default("yearly"),
});
export const dashboardSchema = z.object({
  from: z.iso.date(), to: z.iso.date(), asOf: z.iso.date(),
  collection: z.object({
    collectedPaise: amount, commissionPaise: amount, paidCommissionPaise: amount, netPaise: amount,
    receipts: count, namedDonors: count, cashPaise: amount, digitalPaise: amount, chequePaise: amount,
    regularPaise: amount, tokenPaise: amount, commissionAllocated: z.boolean(),
  }),
  books: z.object({ total: count, inStock: count, assigned: count, closed: count, partlyUsed: count,
    lost: count, flagged: count, editions: count, leftoverBooks: count, leftoverReceipts: count }),
  people: z.object({ fundraisers: count, activeFundraisers: count, eligibleFundraisers: count,
    admins: count.nullable(), activeAdmins: count.nullable() }),
  workflow: z.object({ overdueBooks: count, draftSubmissions: count, unsubmittedBooks: count,
    uncheckedReceipts: count, openFlags: count, openIssues: count, pendingEdits: count, pendingProfiles: count }),
  trend: z.array(z.object({ date: z.iso.date(), amountPaise: amount })).max(24),
  recent: z.array(z.object({ id: z.uuid(), returnId: z.uuid(), name: z.string(), anonymous: z.boolean(),
    bookNumber: z.string(), editionName: z.string(), amountPaise: amount, date: z.iso.date(),
    payment: z.enum(["CASH", "DIGITAL", "CHEQUE"]), checked: z.boolean() })).max(8),
});
export const dashboardResponseSchema = z.object({ data: dashboardSchema });
export type DashboardData = z.infer<typeof dashboardSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardPeriod = DashboardQuery["period"];
export type ChartInterval = DashboardQuery["interval"];
