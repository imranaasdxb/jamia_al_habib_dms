import "server-only";
import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { bookAssignments, bookReturns, books, leftoverBooks } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { leftoverRowSchema } from "@/modules/books/leftovers.schema";
import type { LeftoversQuery } from "@/modules/books/leftovers.schema";

const eligible = sql<boolean>`(${leftoverBooks.status} = 'AVAILABLE' and ${books.status} = 'PARTLY_USED' and ${bookReturns.outcome} = 'PARTLY_USED'
  and ${leftoverBooks.receiptFrom} = coalesce(${bookReturns.lastUsed} + 1, ${bookReturns.receiptFrom}) and ${leftoverBooks.receiptTo} = ${bookReturns.receiptTo}
  and not exists (select 1 from public.book_cases c where c.book_id = ${books.id} and c.closed_at is null)
  and not exists (select 1 from public.book_flags f where f.book_id = ${books.id} and f.status <> 'RESOLVED' and f.deleted_at is null)
  and not exists (select 1 from public.book_returns r where r.book_id = ${books.id} and r.created_at > ${bookReturns.createdAt} and r.deleted_at is null))`;
export async function listLeftovers(query: LeftoversQuery) {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const term = `%${query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const where = and(isNull(leftoverBooks.deletedAt), isNull(books.deletedAt), isNull(bookReturns.deletedAt), isNull(bookAssignments.deletedAt),
      query.status === "AVAILABLE" ? eligible : query.status === "HELD" ? or(eq(leftoverBooks.status, "HELD"), and(eq(leftoverBooks.status, "AVAILABLE"), sql`not ${eligible}`))
        : query.status === "ASSIGNED" ? eq(leftoverBooks.status, "ASSIGNED") : undefined,
      query.search ? or(ilike(leftoverBooks.code, term), ilike(books.bookNumber, term), ilike(bookAssignments.collectorName, term)) : undefined);
    const base = () => tx.select({ total: count() }).from(leftoverBooks).innerJoin(books, eq(books.id, leftoverBooks.bookId))
      .innerJoin(bookReturns, eq(bookReturns.id, leftoverBooks.returnId)).innerJoin(bookAssignments, eq(bookAssignments.id, bookReturns.assignmentId));
    const [result] = await base().where(where); const total = result?.total ?? 0; const pageSize = 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select({ leftover: leftoverBooks, book: books, returnDate: bookReturns.returnDate, returnedByName: bookAssignments.collectorName, assignable: eligible })
      .from(leftoverBooks).innerJoin(books, eq(books.id, leftoverBooks.bookId)).innerJoin(bookReturns, eq(bookReturns.id, leftoverBooks.returnId))
      .innerJoin(bookAssignments, eq(bookAssignments.id, bookReturns.assignmentId)).where(where)
      .orderBy(desc(leftoverBooks.createdAt), desc(leftoverBooks.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(({ leftover, book, returnDate, returnedByName, assignable }) => leftoverRowSchema.parse({ ...leftover, book: {
      ...book, updatedAt: book.updatedAt.toISOString() }, returnDate, returnedByName, assignable,
      status: leftover.status === "AVAILABLE" && !assignable ? "HELD" : leftover.status, updatedAt: leftover.updatedAt.toISOString() })), total, page, pageSize };
  });
}
