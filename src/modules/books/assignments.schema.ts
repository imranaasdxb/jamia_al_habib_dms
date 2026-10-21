import { z } from "zod";
import { bookRowSchema } from "@/modules/books/books.schema";

export const assignmentValuesSchema = z.strictObject({
  source: z.enum(["NEW", "LEFTOVER"]).default("NEW"), leftoverIds: z.array(z.uuid()).max(150).default([]),
  assignmentDate: z.iso.date(), expectedReturnDate: z.iso.date(), collectorId: z.uuid(),
  areaIds: z.array(z.uuid()).min(1).max(50), bookIds: z.array(z.uuid()).min(1).max(150),
  remarks: z.string().trim().max(1000),
}).superRefine((values, ctx) => {
  if ((values.source === "NEW" && values.leftoverIds.length > 0) || (values.source === "LEFTOVER" && values.leftoverIds.length !== values.bookIds.length)
    || new Set(values.leftoverIds).size !== values.leftoverIds.length) ctx.addIssue({ code: "custom", path: ["leftoverIds"], message: "leftoversInvalid" });
  if (values.expectedReturnDate < values.assignmentDate) ctx.addIssue({ code: "custom", path: ["expectedReturnDate"], message: "assignInvalid" });
  for (const field of ["areaIds", "bookIds"] as const) if (new Set(values[field]).size !== values[field].length) {
    ctx.addIssue({ code: "custom", path: [field], message: "assignInvalid" });
  }
});
export const assignmentSubmissionSchema = z.strictObject({ operationId: z.uuid(), values: assignmentValuesSchema });
export const assignmentQuerySchema = z.object({ search: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", "OPEN", "OVERDUE", "CLOSED"]).default("ALL"),
  collectorId: z.union([z.literal(""), z.uuid()]).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) });
export const assignmentRowSchema = z.object({ id: z.uuid(), number: z.string(), assignmentDate: z.iso.date(), expectedReturnDate: z.iso.date(),
  source: z.enum(["NEW", "LEFTOVER"]),
  collectorId: z.uuid(), collectorName: z.string(), collectorCode: z.string(), phone: z.string(), whatsapp: z.string(), address: z.string(),
  areas: z.array(z.object({ id: z.uuid(), nameEn: z.string(), nameUr: z.string() })), bookIds: z.array(z.uuid()),
  assignedByName: z.string(), remarks: z.string(), openCount: z.number().int(), updatedAt: z.iso.datetime() });
export const assignmentsResponseSchema = z.object({ data: z.array(assignmentRowSchema), meta: z.object({ total: z.number(), page: z.number(), pageSize: z.number(), overdue: z.number() }) });
export const assignmentDetailSchema = z.object({ assignment: assignmentRowSchema, books: z.array(bookRowSchema.extend({ closedAt: z.iso.datetime().nullable(),
  assignedFrom: z.number().int(), assignedTo: z.number().int(), source: z.enum(["NEW", "LEFTOVER"]), sourceCode: z.string() })) });
export const assignmentDetailResponseSchema = z.object({ data: assignmentDetailSchema });
export const assignmentSavedSchema = z.object({ data: assignmentDetailSchema.extend({ replayed: z.boolean() }) });
export const assignmentDefaultsSchema = z.object({ data: z.object({ returnMonths: z.number().int().min(1).max(60) }) });
export type AssignmentValues = z.infer<typeof assignmentValuesSchema>;
export type AssignmentSubmission = z.infer<typeof assignmentSubmissionSchema>;
export type AssignmentQuery = z.infer<typeof assignmentQuerySchema>;
export type AssignmentRow = z.infer<typeof assignmentRowSchema>;
export type AssignmentDetail = z.infer<typeof assignmentDetailSchema>;
export type AssignmentsPage = { rows: AssignmentRow[]; total: number; page: number; pageSize: number; overdue: number };
export const indiaToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export function returnDate(date: string, months: number) {
  if (!z.iso.date().safeParse(date).success) return "";
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months + 1, 0));
  end.setUTCDate(Math.min(start.getUTCDate(), end.getUTCDate()));
  return end.toISOString().slice(0, 10);
}
