import "server-only";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { bookAssignments, bookCases, bookReturns, books, collectors, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { bookRowSchema } from "@/modules/books/books.schema";
import { assignmentRowSchema, indiaToday } from "@/modules/books/assignments.schema";
import { openReturnCaseSchema, returnChecks, returnRowSchema } from "@/modules/books/returns.schema";
import type { RequestDatabase } from "@/lib/db";
import type { ReturnQuery, ReturnSubmission } from "@/modules/books/returns.schema";

type ReturnErrorDetails = { stage?: string; sqlState?: string; object?: string; constraint?: string; function?: string; line?: number; fields?: string[];
  connection?: { host: string; database: string } };
export class ReturnFailure extends AuthFailure {
  constructor(code: string, status: number, public readonly details?: ReturnErrorDetails) { super(code, status); }
}
export function returnDatabaseFailure(error: unknown, stage?: string) {
  if (error instanceof AuthFailure) return error;
  const details: ReturnErrorDetails = { ...(stage ? { stage } : {}) };
  const cause = error instanceof Error ? error.cause : undefined;
  for (const value of [cause, error]) {
    if (typeof value !== "object" || value === null || !("code" in value) || typeof value.code !== "string" || !/^[A-Z0-9]{5}$/.test(value.code)) continue;
    details.sqlState = value.code;
    const message = "message" in value && typeof value.message === "string" ? value.message : "";
    const object = /^(?:column|relation|function) "?([a-z_][a-z0-9_.]*)/i.exec(message)?.[1];
    if (object) details.object = object;
    const constraint = "constraint_name" in value ? value.constraint_name : undefined;
    if (typeof constraint === "string" && /^[a-z_][a-z0-9_]{0,127}$/i.test(constraint)) details.constraint = constraint;
    const context = "where" in value && typeof value.where === "string" ? value.where : "";
    const location = /PL\/pgSQL function ([a-z_][a-z0-9_.]*)\([^)]*\) line (\d+)/i.exec(context);
    if (location) { details.function = location[1]; details.line = Number(location[2]); }
    break;
  }
  if (error instanceof ZodError) details.fields = error.issues.map((issue) => issue.path.map(String).join("."));
  // Keep SQL, request values, connection strings and raw error messages out of logs and responses.
  console.error("[book-submission] Save or read failed", details);
  if (process.env.NODE_ENV === "development") {
    try {
      const target = new URL(process.env.DATABASE_URL ?? "");
      details.connection = { host: target.hostname, database: decodeURIComponent(target.pathname.slice(1)) };
    } catch { /* Connection diagnostics must never hide the original failure. */ }
  }
  if (["P0001", "23505"].includes(details.sqlState ?? "")) return new ReturnFailure("RETURN_CHANGED", 409, details);
  if (details.sqlState === "23514") return new ReturnFailure("RETURN_INVALID", 400, details);
  return new ReturnFailure("RETURNS_UNAVAILABLE", 503, details);
}

const literalLike = (term: string) => `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
const openCount = sql<number>`(select count(*)::integer from public.book_cases c where c.assignment_id = ${bookAssignments.id} and c.closed_at is null)`;
const caseColumns = { id: bookCases.id, book: books, assignment: bookAssignments, openCount,
  commissionBasisPoints: collectors.commissionBasisPoints, hasPhoto: sql<boolean>`${people.profilePhotoKey} is not null`,
  submissionId: bookReturns.id,
  receiptFrom: bookCases.receiptFrom, receiptTo: bookCases.receiptTo, source: bookCases.source, sourceCode: bookCases.sourceCode };
type CaseRecord = { id: string; book: typeof books.$inferSelect; assignment: typeof bookAssignments.$inferSelect; openCount: number;
  commissionBasisPoints: number | null; hasPhoto: boolean; submissionId: string | null;
  receiptFrom: number; receiptTo: number; source: "NEW" | "LEFTOVER"; sourceCode: string };
const serializeCase = (row: CaseRecord) => openReturnCaseSchema.parse({ id: row.id, source: row.source, sourceCode: row.sourceCode,
  commissionBasisPoints: row.commissionBasisPoints, hasPhoto: row.hasPhoto, submissionId: row.submissionId,
  book: bookRowSchema.parse({ ...row.book, receiptFrom: row.receiptFrom, receiptTo: row.receiptTo, totalReceipts: row.receiptTo - row.receiptFrom + 1,
    faceValuePaise: row.book.tokenValuePaise === null ? null : (row.receiptTo - row.receiptFrom + 1) * row.book.tokenValuePaise, updatedAt: row.book.updatedAt.toISOString() }),
  assignment: assignmentRowSchema.parse({ ...row.assignment, openCount: row.openCount, updatedAt: row.assignment.updatedAt.toISOString() }) });
const serializeReturn = (row: typeof bookReturns.$inferSelect) => returnRowSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
const liveCase = and(isNull(bookCases.closedAt), isNull(books.deletedAt), isNull(bookAssignments.deletedAt), inArray(books.status, ["ASSIGNED", "LEFTOVER_ASSIGNED"]));
async function findCase(tx: RequestDatabase, id: string) {
  const [row] = await tx.select(caseColumns).from(bookCases).innerJoin(books, eq(books.id, bookCases.bookId))
    .innerJoin(bookAssignments, eq(bookAssignments.id, bookCases.assignmentId))
    .innerJoin(collectors, eq(collectors.personId, bookAssignments.collectorId)).innerJoin(people, eq(people.id, collectors.personId))
    .leftJoin(bookReturns, eq(bookReturns.caseId, bookCases.id)).where(and(liveCase, eq(bookCases.id, id))).limit(1);
  if (!row) throw new AuthFailure("RETURN_NOT_OPEN", 409);
  return serializeCase(row);
}
export async function listOpenReturns(query: ReturnQuery) {
  return withBooksDatabase(async (tx) => {
    const term = literalLike(query.search);
    const where = and(liveCase, query.collectorId ? eq(bookAssignments.collectorId, query.collectorId) : undefined,
      query.overdue === "OVERDUE" ? lt(bookAssignments.expectedReturnDate, indiaToday()) : undefined,
      query.search ? or(ilike(books.bookNumber, term), ilike(bookCases.sourceCode, term), ilike(bookAssignments.collectorName, term), ilike(bookAssignments.collectorCode, term), ilike(bookAssignments.number, term)) : undefined);
    const [result] = await tx.select({ total: count() }).from(bookCases).innerJoin(books, eq(books.id, bookCases.bookId))
      .innerJoin(bookAssignments, eq(bookAssignments.id, bookCases.assignmentId)).where(where);
    const total = result?.total ?? 0; const pageSize = 20; const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select(caseColumns).from(bookCases).innerJoin(books, eq(books.id, bookCases.bookId))
      .innerJoin(bookAssignments, eq(bookAssignments.id, bookCases.assignmentId))
      .innerJoin(collectors, eq(collectors.personId, bookAssignments.collectorId)).innerJoin(people, eq(people.id, collectors.personId))
      .leftJoin(bookReturns, eq(bookReturns.caseId, bookCases.id)).where(where)
      .orderBy(asc(bookAssignments.expectedReturnDate), asc(books.bookNumber), asc(bookCases.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(serializeCase), total, page, pageSize };
  });
}
export async function listBookReturns(query: ReturnQuery) {
  return withBooksDatabase(async (tx) => {
    const term = literalLike(query.search);
    const where = and(isNull(bookReturns.deletedAt), query.search ? or(ilike(bookReturns.bookNumber, term), ilike(bookReturns.sourceCode, term), ilike(bookReturns.number, term), ilike(bookReturns.collectorName, term)) : undefined);
    const [result] = await tx.select({ total: count() }).from(bookReturns).where(where);
    const total = result?.total ?? 0; const pageSize = 20; const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select().from(bookReturns).where(where).orderBy(desc(bookReturns.createdAt), asc(bookReturns.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(serializeReturn), total, page, pageSize };
  });
}
async function savedResult(tx: RequestDatabase, row: typeof bookReturns.$inferSelect, replayed: boolean) {
  const [book] = await tx.select().from(books).where(eq(books.id, row.bookId)).limit(1);
  if (!book) throw new AuthFailure("RETURNS_UNAVAILABLE", 503);
  return { row: serializeReturn(row), book: bookRowSchema.parse({ ...book, updatedAt: book.updatedAt.toISOString() }), replayed };
}
export async function saveBookReturn(input: ReturnSubmission) {
  const values = { ...input.values, exceptions: [...input.values.exceptions].sort((a, b) => a.receiptNumber - b.receiptNumber) };
  const hash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  let stage = "account-context";
  try {
    return await withBooksDatabase(async (tx, actor) => {
      stage = "operation-lock";
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dms:return:operation:${input.operationId}`}))`);
      stage = "existing-submission";
      const [previous] = await tx.select().from(bookReturns).where(eq(bookReturns.operationId, input.operationId)).limit(1);
      if (previous) {
        if (previous.operationHash !== hash || previous.createdBy !== actor.id) throw new AuthFailure("BOOK_OPERATION_CHANGED", 409);
        stage = "existing-submission-response";
        return await savedResult(tx, previous, true);
      }
      stage = "assigned-book";
      const current = await findCase(tx, values.caseId);
      const checks = returnChecks(values, current.book);
      if (values.returnDate < current.assignment.assignmentDate || values.returnDate > indiaToday() || !checks.rangeValid || !checks.exceptionsValid
        || values.receiptsUsed > current.book.totalReceipts || (values.outcome === "CLOSED" && checks.remaining !== 0)
        || (values.outcome === "PARTLY_USED" && checks.remaining <= 0)) throw new AuthFailure("RETURN_INVALID", 400);
      stage = "insert-submission";
      const [row] = await tx.insert(bookReturns).values({ ...values, exceptions: values.exceptions.map((item) => ({ ...item, reasonEn: "", reasonUr: "" })),
        submissionPending: true, commissionBasisPoints: current.commissionBasisPoints ?? 0,
        bookId: current.book.id, assignmentId: current.assignment.id, bookNumber: current.book.bookNumber, collectorName: current.assignment.collectorName,
        receiptFrom: current.book.receiptFrom, receiptTo: current.book.receiptTo, checkedByName: actor.fullName,
        createdBy: actor.id, updatedBy: actor.id, operationId: input.operationId, operationHash: hash }).returning();
      if (!row) throw new AuthFailure("RETURNS_UNAVAILABLE", 503);
      stage = "submission-response";
      return await savedResult(tx, row, false);
    });
  } catch (error) {
    throw returnDatabaseFailure(error, stage);
  }
}
