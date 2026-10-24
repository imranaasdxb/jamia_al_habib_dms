import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getAccountContext } from "@/lib/auth/session";
import { withRequestDatabase } from "@/lib/db";
import { books, masterRecords, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookEntryDataSchema, bookRowSchema, bulkBookRows } from "@/modules/books/books.schema";
import type { RequestDatabase } from "@/lib/db";
import type { BookSubmission, BooksQuery, SingleBookValues } from "@/modules/books/books.schema";

export class BookConflict extends AuthFailure {
  constructor(code: string, public readonly bookNumber: string) { super(code, 409); }
}
export async function withBooksDatabase<T>(operation: (tx: RequestDatabase, actor: { id: string; fullName: string; role: "ADMIN" | "STAFF" | "COLLECTOR" }) => Promise<T>) {
  const context = await getAccountContext(true);
  if (!context) throw new AuthFailure("SESSION_EXPIRED", 401);
  return withRequestDatabase({ email: context.identity.email, authUserId: context.identity.id }, async (tx) => {
    const [actor] = await tx.select({ id: people.id, fullName: people.fullName, role: people.role }).from(people).where(and(
      eq(people.id, context.account.id), eq(people.authUserId, context.identity.id), eq(people.status, "ACTIVE"), isNull(people.deletedAt),
    )).limit(1).for("share");
    if (!actor || actor.role !== context.account.role) throw new AuthFailure("ACCESS_DENIED");
    await tx.execute(sql`select set_config('app.person_id', ${actor.id}, true), set_config('app.role', ${actor.role}, true)`);
    return operation(tx, actor);
  });
}
function serialize(row: typeof books.$inferSelect) { return bookRowSchema.parse({ ...row, updatedAt: row.updatedAt.toISOString() }); }
const literalLike = (term: string) => `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
export async function bookEntryContext(page: number) {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role === "COLLECTOR") throw new AuthFailure("ACCESS_DENIED");
    const [result] = await tx.execute<{ data: unknown }>(sql`
      select jsonb_build_object(
        'rows', coalesce((select jsonb_agg(b order by b.created_at desc, b."receiptTo" desc, b.id desc) from (
          select id, book_number as "bookNumber", receipt_from as "receiptFrom", receipt_to as "receiptTo", created_at
          from public.books where deleted_at is null
          order by created_at desc, receipt_to desc, id desc limit 25 offset ${(page - 1) * 24}
        ) b), '[]'::jsonb),
        'latestId', (select id from public.books where deleted_at is null order by created_at desc, receipt_to desc, id desc limit 1),
        'nextReceipt', (select case when coalesce(max(receipt_to), 0) < 2147483647
          then coalesce(max(receipt_to), 0) + 1 else null end from public.books),
        'hasMore', false
      ) as data`);
    const data = bookEntryDataSchema.parse(result?.data);
    return { ...data, rows: data.rows.slice(0, 24), hasMore: data.rows.length > 24 };
  });
}
export async function listBooks(query: BooksQuery) {
  return withBooksDatabase(async (tx) => {
    const term = literalLike(query.search);
    const receipt = /^\d{1,10}$/.test(query.search) && Number(query.search) <= 2147483647 ? Number(query.search) : null;
    const where = and(isNull(books.deletedAt), query.editionId ? eq(books.editionId, query.editionId) : undefined,
      query.bookType !== "ALL" ? eq(books.bookType, query.bookType) : undefined,
      query.tokenValue ? eq(books.tokenValuePaise, Number(query.tokenValue) * 100) : undefined,
      query.search ? or(ilike(books.bookNumber, term), ilike(books.editionNameEn, term), ilike(books.editionNameUr, term),
        receipt !== null ? sql`int8range(${books.receiptFrom}::bigint, ${books.receiptTo}::bigint, '[]') @> ${receipt}::bigint` : undefined) : undefined);
    const [result] = await tx.select({ total: count() }).from(books).where(where);
    const total = result?.total ?? 0;
    const pageSize = 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select().from(books).where(where).orderBy(asc(books.receiptFrom), asc(books.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(serialize), total, page, pageSize };
  });
}
async function findConflict(tx: RequestDatabase, rows: SingleBookValues[]) {
  const first = rows[0]; const last = rows.at(-1);
  if (!first || !last) throw new AuthFailure("INVALID_INPUT", 400);
  const [conflict] = await tx.select({ bookNumber: books.bookNumber }).from(books).where(or(
    inArray(books.bookNumber, rows.map((row) => row.bookNumber)),
    sql`int8range(${books.receiptFrom}::bigint, ${books.receiptTo}::bigint, '[]')
      && int8range(${Number(first.receiptFrom)}::bigint, ${Number(last.receiptTo)}::bigint, '[]')`,
  )).limit(1);
  if (conflict) return new BookConflict(rows.some((row) => row.bookNumber === conflict.bookNumber)
    ? "BOOK_NUMBER_EXISTS" : "RECEIPT_RANGE_USED", conflict.bookNumber);
  return null;
}
export async function addBookStock(input: BookSubmission) {
  const rows = input.mode === "BULK" ? bulkBookRows(input.values) : [input.values];
  const first = rows[0];
  if (!first) throw new AuthFailure("INVALID_INPUT", 400);
  const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  try {
    return await withBooksDatabase(async (tx, actor) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dms:book-stock:write'))`);
      const previous = await tx.select().from(books).where(eq(books.operationId, input.operationId));
      if (previous.length) {
        if (previous.length !== rows.length || previous.some((row) => row.operationHash !== hash || row.createdBy !== actor.id)) {
          throw new AuthFailure("BOOK_OPERATION_CHANGED", 409);
        }
        return { rows: previous.map(serialize), replayed: true };
      }
      const masters = await tx.select().from(masterRecords).where(and(eq(masterRecords.active, true), isNull(masterRecords.deletedAt), or(
        eq(masterRecords.id, first.editionId), and(eq(masterRecords.kind, "BOOK_TYPE"), eq(masterRecords.code, first.bookType)),
        first.bookType === "TOKEN" ? and(eq(masterRecords.kind, "TOKEN_VALUE"), eq(masterRecords.tokenValueRupees, Number(first.tokenValue))) : undefined,
      ))).for("share");
      const edition = masters.find((row) => row.id === first.editionId && row.kind === "EDITION");
      if (!edition) throw new AuthFailure("BOOK_EDITION_INVALID", 409);
      if (!masters.some((row) => row.kind === "BOOK_TYPE" && row.code === first.bookType)
        || (first.bookType === "TOKEN" && !masters.some((row) => row.kind === "TOKEN_VALUE" && row.tokenValueRupees === Number(first.tokenValue)))) {
        throw new AuthFailure("BOOK_OPTION_INACTIVE", 409);
      }
      const conflict = await findConflict(tx, rows);
      if (conflict) throw conflict;
      const saved = await tx.insert(books).values(rows.map((row) => ({ bookNumber: row.bookNumber, stockDate: row.stockDate,
        editionId: row.editionId, editionNameEn: edition.nameEn, editionNameUr: edition.nameUr, bookType: row.bookType,
        tokenValuePaise: row.bookType === "TOKEN" ? Number(row.tokenValue) * 100 : null,
        receiptFrom: Number(row.receiptFrom), receiptTo: Number(row.receiptTo), remarks: row.remarks,
        entryByName: actor.fullName, createdBy: actor.id, updatedBy: actor.id,
        operationId: input.operationId, operationHash: hash,
      }))).returning();
      return { rows: saved.map(serialize), replayed: false };
    });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const constraintConflict = [error, cause].some((value) => typeof value === "object" && value !== null
      && "code" in value && (value.code === "23P01" || value.code === "23505"));
    // Owner-side SQL can race the application lock; identify its clashing book in a fresh transaction.
    if (constraintConflict) {
      const conflict = await withBooksDatabase((tx) => findConflict(tx, rows));
      if (conflict) throw conflict;
    }
    throw error;
  }
}
