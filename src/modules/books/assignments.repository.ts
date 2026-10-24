import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { bookAssignments, bookCases, books, collectors, leftoverBooks, masterRecords, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { bookRowSchema } from "@/modules/books/books.schema";
import { assignmentRowSchema } from "@/modules/books/assignments.schema";
import type { RequestDatabase } from "@/lib/db";
import type { AssignmentQuery, AssignmentSubmission } from "@/modules/books/assignments.schema";

const literalLike = (term: string) => `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
const openCount = sql<number>`(select count(*)::integer from public.book_cases c where c.assignment_id = ${bookAssignments.id} and c.closed_at is null)`;
function serialize(row: typeof bookAssignments.$inferSelect, count: number) {
  return assignmentRowSchema.parse({ ...row, openCount: count, updatedAt: row.updatedAt.toISOString() });
}
async function detail(tx: RequestDatabase, id: string) {
  const [record] = await tx.select({ assignment: bookAssignments, openCount }).from(bookAssignments)
    .where(and(eq(bookAssignments.id, id), isNull(bookAssignments.deletedAt))).limit(1);
  if (!record) throw new AuthFailure("ASSIGNMENT_NOT_FOUND", 404);
  const rows = await tx.select({ book: books, closedAt: bookCases.closedAt, assignedFrom: bookCases.receiptFrom, assignedTo: bookCases.receiptTo,
    source: bookCases.source, sourceCode: bookCases.sourceCode }).from(bookCases)
    .innerJoin(books, eq(books.id, bookCases.bookId)).where(eq(bookCases.assignmentId, id)).orderBy(asc(books.receiptFrom), asc(books.id));
  return { assignment: serialize(record.assignment, record.openCount), books: rows.map(({ book, closedAt, ...range }) => ({ ...range,
    ...bookRowSchema.parse({ ...book, updatedAt: book.updatedAt.toISOString() }), closedAt: closedAt?.toISOString() ?? null,
  })) };
}
export const readAssignment = (id: string) => withBooksDatabase((tx) => detail(tx, id));
export async function assignmentDefaults() {
  return withBooksDatabase(async (tx) => {
    const result = await tx.execute<{ returnMonths: number }>(sql`select public.assignment_return_months() as "returnMonths"`);
    return { returnMonths: result[0]?.returnMonths ?? 11 };
  });
}
export async function listAssignments(query: AssignmentQuery) {
  return withBooksDatabase(async (tx) => {
    const term = literalLike(query.search);
    const where = and(isNull(bookAssignments.deletedAt), query.collectorId ? eq(bookAssignments.collectorId, query.collectorId) : undefined,
      query.status === "CLOSED" ? sql`${openCount} = 0` : query.status === "OPEN" || query.status === "OVERDUE" ? sql`${openCount} > 0` : undefined,
      query.status === "OVERDUE" ? sql`${bookAssignments.expectedReturnDate} < (now() at time zone 'Asia/Kolkata')::date` : undefined,
      query.search ? or(ilike(bookAssignments.number, term), ilike(bookAssignments.collectorName, term), ilike(bookAssignments.collectorCode, term), ilike(bookAssignments.phone, term)) : undefined);
    const [result] = await tx.select({ total: count(), overdue: sql<number>`count(*) filter (where ${openCount} > 0 and ${bookAssignments.expectedReturnDate} < (now() at time zone 'Asia/Kolkata')::date)::integer` }).from(bookAssignments).where(where);
    const total = result?.total ?? 0; const pageSize = 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select({ assignment: bookAssignments, openCount }).from(bookAssignments).where(where)
      .orderBy(desc(bookAssignments.createdAt), asc(bookAssignments.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map((row) => serialize(row.assignment, row.openCount)), total, page, pageSize, overdue: result?.overdue ?? 0 };
  });
}
export async function availableBooks(search: string, assignmentDate: string, page: number) {
  return withBooksDatabase(async (tx) => {
    const term = literalLike(search);
    const where = and(eq(books.status, "IN_STOCK"), isNull(books.deletedAt), sql`${books.stockDate} <= ${assignmentDate}::date`,
      sql`not exists (select 1 from public.book_cases c where c.book_id = ${books.id} and c.closed_at is null)`,
      search ? or(ilike(books.bookNumber, term), ilike(books.editionNameEn, term), ilike(books.editionNameUr, term)) : undefined);
    const [result] = await tx.select({ total: count() }).from(books).where(where);
    const total = result?.total ?? 0; const pageSize = 20;
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select().from(books).where(where).orderBy(asc(books.receiptFrom), asc(books.id)).limit(pageSize).offset((currentPage - 1) * pageSize);
    return { rows: rows.map((row) => bookRowSchema.parse({ ...row, updatedAt: row.updatedAt.toISOString() })), total, page: currentPage, pageSize };
  });
}
export async function createAssignment(input: AssignmentSubmission) {
  const values = { ...input.values, bookIds: [...input.values.bookIds].sort(), areaIds: [...input.values.areaIds].sort() };
  const hash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  try {
    return await withBooksDatabase(async (tx, actor) => {
      if (values.source === "LEFTOVER" && actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dms:assignments:write'))`);
      const [previous] = await tx.select().from(bookAssignments).where(eq(bookAssignments.operationId, input.operationId)).limit(1);
      if (previous) {
        if (previous.operationHash !== hash || previous.createdBy !== actor.id) throw new AuthFailure("BOOK_OPERATION_CHANGED", 409);
        return { ...await detail(tx, previous.id), replayed: true };
      }
      const [fundraiser] = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, values.collectorId),
        eq(people.role, "COLLECTOR"), eq(people.status, "ACTIVE"), isNull(people.deletedAt))).limit(1);
      if (!fundraiser) throw new AuthFailure("ASSIGNMENT_FUNDRAISER", 409);
      if (values.source === "LEFTOVER") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dms:collector:${values.collectorId}`}))`);
        const [eligible] = await tx.select({ allowed: collectors.leftoverEligible }).from(collectors)
          .where(and(eq(collectors.personId, values.collectorId), isNull(collectors.deletedAt))).limit(1).for("share");
        if (!eligible?.allowed) throw new AuthFailure("LEFTOVER_FUNDRAISER_INELIGIBLE", 409);
        const leftovers = await tx.select().from(leftoverBooks).where(and(inArray(leftoverBooks.id, values.leftoverIds), isNull(leftoverBooks.deletedAt)));
        if (leftovers.length !== values.bookIds.length || leftovers.some((row) => row.status !== "AVAILABLE" || !values.bookIds.includes(row.bookId))
          || new Set(leftovers.map((row) => row.bookId)).size !== values.bookIds.length) throw new AuthFailure("LEFTOVER_CHANGED", 409);
      }
      const areas = await tx.select({ id: masterRecords.id, nameEn: masterRecords.nameEn, nameUr: masterRecords.nameUr }).from(masterRecords)
        .where(and(inArray(masterRecords.id, values.areaIds), eq(masterRecords.kind, "AREA"), eq(masterRecords.active, true), isNull(masterRecords.deletedAt)));
      if (areas.length !== values.areaIds.length) throw new AuthFailure("ASSIGNMENT_AREAS", 409);
      const [saved] = await tx.insert(bookAssignments).values({ source: values.source, leftoverIds: values.leftoverIds,
        assignmentDate: values.assignmentDate, expectedReturnDate: values.expectedReturnDate,
        collectorId: values.collectorId, collectorName: "", collectorCode: "", phone: "", whatsapp: "", address: "", assignedByName: actor.fullName,
        areas, bookIds: values.bookIds, remarks: values.remarks, operationId: input.operationId, operationHash: hash, createdBy: actor.id, updatedBy: actor.id }).returning();
      if (!saved) throw new AuthFailure("ASSIGNMENTS_UNAVAILABLE", 503);
      return { ...await detail(tx, saved.id), replayed: false };
    });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if ([error, cause].some((value) => typeof value === "object" && value !== null && "code" in value && (value.code === "P0001" || value.code === "23505"))) {
      throw new AuthFailure("ASSIGNMENT_CHANGED", 409);
    }
    throw error;
  }
}
