import "server-only";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { bookAssignments, bookFlags, bookReceipts, bookReturns, books, people, receiptEditRequests, receiptIssues } from "@/lib/db/schema";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { AuthFailure } from "@/modules/auth/auth.types";
import { returnRowSchema } from "@/modules/books/returns.schema";
import { donorSuggestionSchema, receiptBookSchema, receiptHeaderSchema, receiptRecordSchema, receiptValuesSchema } from "@/modules/receipts/receipts.schema";
import { readProfilePhoto, removeProfilePhoto, uploadReceiptPhoto } from "@/lib/storage/profile-photos";
import type { RequestDatabase } from "@/lib/db";
import type { ReceiptAction, ReceiptQuery, receiptWorkflowActionSchema } from "@/modules/receipts/receipts.schema";
import type { z } from "zod";

export class ReceiptFailure extends AuthFailure {
  constructor(code: string, status = 409, public readonly receiptNumber?: number,
    public readonly setupDetails?: { sqlState: string; missingObject?: string }) { super(code, status); }
}
const serialize = (row: typeof bookReceipts.$inferSelect) => receiptRecordSchema.parse({ id: row.id, number: row.number, version: row.version, values: row.data,
  checked: row.checked,
  labels: row.labels, hasPhoto: row.photoKey !== null, updatedAt: row.updatedAt.toISOString(), entryByName: row.entryByName });
const headerColumns = { returned: bookReturns, assignmentDate: bookAssignments.assignmentDate, editionEn: books.editionNameEn, editionUr: books.editionNameUr,
  collectorId: bookAssignments.collectorId, collectorCode: bookAssignments.collectorCode, phone: bookAssignments.phone, address: bookAssignments.address,
  assignmentNumber: bookAssignments.number, expectedReturnDate: bookAssignments.expectedReturnDate, hasPhoto: sql<boolean>`${people.profilePhotoKey} is not null`,
  bookType: books.bookType, tokenValuePaise: books.tokenValuePaise };
type HeaderRecord = { returned: typeof bookReturns.$inferSelect; assignmentDate: string; editionEn: string; editionUr: string; bookType: "REGULAR" | "TOKEN"; tokenValuePaise: number | null;
  collectorId: string; collectorCode: string; phone: string; address: string; assignmentNumber: string; expectedReturnDate: string; hasPhoto: boolean };
const header = (row: HeaderRecord) => receiptHeaderSchema.parse({ ...row, returned: returnRowSchema.parse({ ...row.returned, createdAt: row.returned.createdAt.toISOString() }),
  submissionPending: row.returned.submissionPending, version: row.returned.receiptEntryVersion, finalized: row.returned.finalizedAt !== null });
function headerQuery(tx: RequestDatabase) { return tx.select(headerColumns).from(bookReturns).innerJoin(books, eq(books.id, bookReturns.bookId))
  .innerJoin(bookAssignments, eq(bookAssignments.id, bookReturns.assignmentId)).innerJoin(people, eq(people.id, bookAssignments.collectorId)); }
export async function receiptQueue(query: ReceiptQuery) {
  return withBooksDatabase(async (tx) => {
    const term = `%${query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const where = and(isNull(bookReturns.deletedAt), query.status === "PENDING" ? isNull(bookReturns.finalizedAt) : query.status === "FINALIZED" ? isNotNull(bookReturns.finalizedAt) : undefined,
      query.search ? or(ilike(bookReturns.bookNumber, term), ilike(bookReturns.number, term), ilike(bookReturns.collectorName, term), ilike(bookReturns.sourceCode, term)) : undefined);
    const [result] = await tx.select({ total: count() }).from(bookReturns).where(where); const total = result?.total ?? 0; const pageSize = 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await headerQuery(tx).where(where).orderBy(desc(bookReturns.createdAt), asc(bookReturns.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(header), total, page, pageSize };
  });
}
async function readBook(tx: RequestDatabase, id: string, requestedPage: number) {
  const [row] = await headerQuery(tx).where(and(eq(bookReturns.id, id), isNull(bookReturns.deletedAt))).limit(1);
  if (!row) throw new ReceiptFailure("RECEIPT_BOOK_NOT_FOUND", 404);
  const total = row.returned.lastUsed === null ? 0 : row.returned.lastUsed - row.returned.receiptFrom + 1;
  const pageSize = 20; const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const first = row.returned.receiptFrom + (page - 1) * pageSize; const last = Math.min(first + pageSize - 1, row.returned.lastUsed ?? first - 1);
  const receipts = await tx.select().from(bookReceipts).where(and(eq(bookReceipts.returnId, id), isNull(bookReceipts.deletedAt),
    sql`${bookReceipts.number} between ${first} and ${last}`)).orderBy(asc(bookReceipts.number));
  const [totals] = await tx.select({ saved: count(), valid: sql<number>`count(*) filter (where status = 'VALID')::integer`,
    total: sql<number>`coalesce(sum(amount_paise) filter (where status = 'VALID'),0)::double precision`,
    cash: sql<number>`coalesce(sum(amount_paise) filter (where status = 'VALID' and data->>'paymentMode' = 'CASH'),0)::double precision`,
    digital: sql<number>`coalesce(sum(amount_paise) filter (where status = 'VALID' and data->>'paymentMode' = 'DIGITAL'),0)::double precision`,
    cheque: sql<number>`coalesce(sum(amount_paise) filter (where status = 'VALID' and data->>'paymentMode' = 'CHEQUE'),0)::double precision` })
    .from(bookReceipts).where(and(eq(bookReceipts.returnId, id), isNull(bookReceipts.deletedAt)));
  const byNumber = new Map(receipts.map((receipt) => [receipt.number, serialize(receipt)]));
  const [checked] = await tx.select({ total: count() }).from(bookReceipts).where(and(eq(bookReceipts.returnId, id), eq(bookReceipts.checked, true), isNull(bookReceipts.deletedAt)));
  const workflow = await workflowRows(tx, id);
  return receiptBookSchema.parse({ header: header(row), totals: totals ?? { saved: 0, valid: 0, total: 0, cash: 0, digital: 0, cheque: 0 },
    checkedCount: checked?.total ?? 0, ...workflow,
    rows: Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => ({ number: first + index, record: byNumber.get(first + index) ?? null })), total, page, pageSize });
}
export const getReceiptBook = (id: string, page: number) => withBooksDatabase((tx) => readBook(tx, id, page));
async function workflowRows(tx: RequestDatabase, returnId?: string) {
  const requests = await tx.select().from(receiptEditRequests).where(returnId ? eq(receiptEditRequests.returnId, returnId) : undefined)
    .orderBy(desc(receiptEditRequests.createdAt)).limit(250);
  const issues = await tx.select().from(receiptIssues).where(returnId ? eq(receiptIssues.returnId, returnId) : undefined)
    .orderBy(desc(receiptIssues.createdAt)).limit(250);
  const flags = await tx.select({ id: bookFlags.id, returnId: bookFlags.returnId, bookNumber: bookReturns.bookNumber, collectorName: bookReturns.collectorName,
    reason: bookFlags.remarks, status: bookFlags.status, expectedPaise: bookFlags.expectedPaise, foundPaise: bookFlags.foundPaise })
    .from(bookFlags).innerJoin(bookReturns, eq(bookReturns.id, bookFlags.returnId))
    .where(and(isNull(bookFlags.deletedAt), returnId ? eq(bookFlags.returnId, returnId) : undefined)).orderBy(desc(bookFlags.createdAt)).limit(250);
  return { requests: requests.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    issues: issues.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), flags };
}
export const getReceiptWorkflow = (returnId?: string) => withBooksDatabase((tx) => workflowRows(tx, returnId));
export async function changeReceiptWorkflow(action: z.infer<typeof receiptWorkflowActionSchema>) {
  return withBooksDatabase(async (tx, actor) => {
    if (action.action === "RAISE_ISSUE" || action.action === "REQUEST_EDIT") {
      await tx.execute(sql`select public.request_receipt_workflow(${action.returnId}::uuid, ${action.number}, ${action.action}, ${action.reason})`);
      return workflowRows(tx, action.returnId);
    }
    if (actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    await tx.execute(sql`select public.review_receipt_workflow(${action.id}::uuid, ${action.action}, ${action.action === "REVIEW_EDIT" ? action.decision : "RESOLVED"}, ${action.reason})`);
    return workflowRows(tx);
  });
}
export async function mutateReceiptBook(id: string, action: ReceiptAction) {
  try {
    return await withBooksDatabase(async (tx, actor) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dms:receipts:${id}`}))`);
      if (action.action === "FINALIZE") {
        await tx.execute(sql`select public.finalize_receipt_book(${id}::uuid, ${action.version})`);
      } else {
        // The per-book advisory lock above serializes saves. Row locks and return updates
        // belong to the protected triggers; the app role has no UPDATE grant here.
        const [returned] = await tx.select().from(bookReturns).where(and(eq(bookReturns.id, id), isNull(bookReturns.deletedAt))).limit(1);
        if (!returned) throw new ReceiptFailure("RECEIPT_BOOK_NOT_FOUND", 404);
        const values = { ...action.values, receiverName: returned.collectorName };
        const [previous] = await tx.select().from(bookReceipts).where(eq(bookReceipts.number, action.number)).limit(1);
        if (previous && previous.returnId === id && previous.version !== action.version && previous.checked === action.checked
          && JSON.stringify(receiptValuesSchema.parse(previous.data)) === JSON.stringify(values)) return readBook(tx, id, action.page);
        if (returned.finalizedAt) {
          if (!previous || previous.returnId !== id) throw new ReceiptFailure("RECEIPT_LOCKED");
          const [approval] = await tx.select({ id: receiptEditRequests.id }).from(receiptEditRequests).where(and(
            eq(receiptEditRequests.receiptId, previous.id), eq(receiptEditRequests.requestedBy, actor.id),
            eq(receiptEditRequests.status, "APPROVED"), eq(receiptEditRequests.baseVersion, previous.version))).limit(1);
          if (!approval) throw new ReceiptFailure("RECEIPT_LOCKED");
        }
        if (previous) {
          if (previous.returnId !== id) throw new ReceiptFailure("RECEIPT_RANGE");
          if (previous.version !== action.version) {
            if (previous.checked === action.checked && JSON.stringify(receiptValuesSchema.parse(previous.data)) === JSON.stringify(values)) return readBook(tx, id, action.page);
            throw new ReceiptFailure("RECEIPT_STALE");
          }
          const saved = await tx.update(bookReceipts).set({ data: values, checked: action.checked, updatedBy: actor.id }).where(and(eq(bookReceipts.id, previous.id), eq(bookReceipts.version, action.version ?? -1))).returning({ id: bookReceipts.id });
          if (!saved.length) throw new ReceiptFailure("RECEIPT_STALE");
        } else {
          if (action.version !== null) throw new ReceiptFailure("RECEIPT_STALE");
          await tx.insert(bookReceipts).values({ returnId: id, bookId: returned.bookId, number: action.number, data: values,
            checked: action.checked,
            status: action.values.status, amountPaise: action.values.amountPaise, entryByName: actor.fullName, createdBy: actor.id, updatedBy: actor.id });
        }
      }
      return readBook(tx, id, action.page);
    });
  } catch (error) { throw receiptDatabaseFailure(error); }
}
export function receiptDatabaseFailure(error: unknown) {
  if (error instanceof AuthFailure) return error;
  const cause = error instanceof Error ? error.cause : undefined;
  for (const value of [cause, error]) if (typeof value === "object" && value !== null && "code" in value) {
    const code = String(value.code);
    if (["42P01", "42703", "42883"].includes(code)) {
      const message = "message" in value && typeof value.message === "string" ? value.message : "";
      const missingObject = /^(?:column|relation|function) "?([a-z_][a-z0-9_.]*)/i.exec(message)?.[1];
      const setupDetails = { sqlState: code, ...(missingObject ? { missingObject } : {}) };
      // Only SQLSTATE and an identifier are recorded; never the query or its parameters.
      console.error("[receipt-entry] Missing database object", setupDetails);
      return new ReceiptFailure("RECEIPT_SETUP_REQUIRED", 503, undefined, setupDetails);
    }
    if (["55P03", "57014"].includes(code)) return new ReceiptFailure("RECEIPT_DATABASE_BUSY", 503);
    if (code === "42501") return new ReceiptFailure("RECEIPT_SETUP_PERMISSIONS", 503);
    if (code === "25P02") return new ReceiptFailure("RECEIPT_SETUP_REQUIRED", 503, undefined, { sqlState: code });
    if (value.code === "23505") return new ReceiptFailure("RECEIPT_DUPLICATE");
    if (value.code === "40001") return new ReceiptFailure("RECEIPT_STALE");
    if (value.code === "40P01") return new ReceiptFailure("RECEIPT_STALE");
    if (value.code === "P0002") {
      const message = "message" in value && typeof value.message === "string" ? value.message : "";
      const match = /Incomplete receipt (\d+)/.exec(message);
      return new ReceiptFailure("RECEIPT_INCOMPLETE", 400, match?.[1] ? Number(match[1]) : undefined);
    }
    if (["P0001", "23514", "22P02", "22007", "22008"].includes(String(value.code))) return new ReceiptFailure("RECEIPT_INVALID", 400);
  }
  // Do not log query text, parameters, connection details or receipt data.
  console.error("[receipt-entry] Unclassified service failure", {
    type: error instanceof Error ? error.name : "UnknownError",
    databaseCode: typeof cause === "object" && cause !== null && "code" in cause
      && typeof cause.code === "string" && /^[A-Z0-9]{5}$/.test(cause.code) ? cause.code : undefined,
  });
  return new ReceiptFailure("RECEIPTS_UNAVAILABLE", 503);
}
export async function donorSuggestions(phone: string) {
  return withBooksDatabase(async (tx) => {
    const rows = await tx.select({ data: bookReceipts.data }).from(bookReceipts).innerJoin(bookReturns, eq(bookReturns.id, bookReceipts.returnId))
      .where(and(eq(bookReceipts.phone, phone), eq(bookReceipts.status, "VALID"), isNull(bookReceipts.deletedAt), isNotNull(bookReturns.finalizedAt)))
      .orderBy(desc(bookReceipts.updatedAt)).limit(50);
    const found = new Map<string, ReturnType<typeof donorSuggestionSchema.parse>>();
    for (const row of rows) {
      const candidate = donorSuggestionSchema.parse(row.data); if (!candidate.donorName) continue;
      const key = JSON.stringify([candidate.donorName.toLowerCase(), candidate.parentName.toLowerCase(), candidate.village, candidate.district]);
      if (!found.has(key)) found.set(key, candidate);
    }
    return [...found.values()].slice(0, 10);
  });
}
async function photoRecord(tx: RequestDatabase, id: string, version?: number) {
  const [record] = await tx.select({ receipt: bookReceipts, finalizedAt: bookReturns.finalizedAt }).from(bookReceipts)
    .innerJoin(bookReturns, eq(bookReturns.id, bookReceipts.returnId)).where(and(eq(bookReceipts.id, id), isNull(bookReceipts.deletedAt))).limit(1);
  if (!record) throw new ReceiptFailure("RECEIPT_BOOK_NOT_FOUND", 404);
  if (version !== undefined && (record.finalizedAt || record.receipt.version !== version)) throw new ReceiptFailure(record.finalizedAt ? "RECEIPT_LOCKED" : "RECEIPT_STALE");
  return record.receipt;
}
export async function receiptPhoto(id: string) {
  const row = await withBooksDatabase((tx) => photoRecord(tx, id));
  if (!row.photoKey) throw new ReceiptFailure("RECEIPT_BOOK_NOT_FOUND", 404);
  return readProfilePhoto(row.photoKey);
}
export async function changeReceiptPhoto(id: string, version: number, file: File | null) {
  await withBooksDatabase((tx) => photoRecord(tx, id, version));
  const key = file ? await uploadReceiptPhoto(id, file) : null;
  let oldKey: string | null = null;
  try {
    const saved = await withBooksDatabase(async (tx, actor) => {
      const previous = await photoRecord(tx, id, version); oldKey = previous.photoKey;
      const [row] = await tx.update(bookReceipts).set({ photoKey: key, updatedBy: actor.id }).where(and(eq(bookReceipts.id, id), eq(bookReceipts.version, version))).returning();
      if (!row) throw new ReceiptFailure("RECEIPT_STALE");
      return serialize(row);
    });
    if (oldKey && oldKey !== key) { try { await removeProfilePhoto(oldKey); } catch { /* A cleanup failure does not undo the saved receipt. */ } }
    return saved;
  } catch (error) {
    if (key && error instanceof AuthFailure) { try { await removeProfilePhoto(key); } catch { /* Keep private orphan objects if cleanup is unavailable. */ } }
    throw receiptDatabaseFailure(error);
  }
}
