import "server-only";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { bookAssignments, bookCases, bookReceipts, bookReturns, books, collectors, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { bookRowSchema } from "@/modules/books/books.schema";
import { assignmentRowSchema, indiaToday } from "@/modules/books/assignments.schema";
import { bookLossResultSchema, openReturnCaseSchema, returnChecks, returnEditionOptionsSchema, returnRowSchema } from "@/modules/books/returns.schema";
import type { RequestDatabase } from "@/lib/db";
import type { BookLossSubmission, ReturnListSummary, ReturnQuery, ReturnSubmission } from "@/modules/books/returns.schema";

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
function submissionSearch(query: ReturnQuery) {
  const term = query.search.replace(/\s+/g, " ").trim();
  if (!term) return undefined;
  const book = /^(?:ed[-\s]?(\d{1,4})[-\s]+)?(?:t[-\s]?(\d{1,3})[-\s]+)?book\s*(?:(?:no|number)\.?\s*)?[#:-]?\s*(\d{1,10})(?:\s*\/\s*(\d{1,10}))?$/i.exec(term);
  if (book?.[3]) {
    if (Number(book[3]) > 2147483647 || (book[4] && Number(book[4]) > 2147483647)) return sql`false`;
    return and(eq(books.editionBookNumber, Number(book[3])),
      book[1] ? eq(books.editionNumber, Number(book[1])) : undefined,
      book[2] ? and(eq(books.bookType, "TOKEN"), eq(books.tokenValuePaise, Number(book[2]) * 100)) : undefined,
      book[4] ? eq(books.receiptFrom, Number(book[4])) : undefined);
  }
  const receipt = /^receipt\s*(?:(?:no|number)\.?\s*)?[#:-]?\s*(\d{1,10})$/i.exec(term);
  if (receipt?.[1]) {
    if (Number(receipt[1]) > 2147483647) return sql`false`;
    return query.tab === "OPEN"
      ? sql`${Number(receipt[1])} between ${bookCases.receiptFrom} and ${bookCases.receiptTo}`
      : sql`${Number(receipt[1])} between ${bookReturns.receiptFrom} and ${bookReturns.receiptTo}`;
  }
  const code = /^(?:(?:slip|assignment|return)\s+)?(ASN|RET)[\s-]*(\d{4})[\s-]+(\d{1,12})$/i.exec(term);
  if (code?.[1] && code[2] && code[3]) {
    const value = `${code[1].toUpperCase()}-${code[2]}-${String(Number(code[3])).padStart(6, "0")}`;
    return code[1].toUpperCase() === "ASN" ? eq(bookAssignments.number, value) : eq(bookReturns.number, value);
  }
  const shortCode = /^(slip|assignment|asn|return|ret)\s*(?:(?:no|number)\.?\s*)?[#:-]?\s*(\d{1,12})$/i.exec(term);
  if (shortCode?.[1] && shortCode[2]) {
    const suffix = `%-${String(Number(shortCode[2])).padStart(6, "0")}`;
    return /^(return|ret)$/i.test(shortCode[1]) ? ilike(bookReturns.number, suffix) : ilike(bookAssignments.number, suffix);
  }
  const jah = /^jah[\s-]*(\d{1,10})$/i.exec(term);
  if (jah?.[1]) return eq(bookAssignments.collectorCode, `JAH${String(Number(jah[1])).padStart(3, "0")}`);
  if (/^\d{1,10}$/.test(term)) {
    const numeric = Number(term);
    const suffix = `%-${String(numeric).padStart(6, "0")}`;
    return or(numeric <= 2147483647 ? eq(books.editionBookNumber, numeric) : undefined,
      ilike(bookAssignments.number, suffix), ilike(bookReturns.number, suffix),
      eq(bookAssignments.collectorCode, `JAH${String(numeric).padStart(3, "0")}`),
      term.length >= 3 ? or(ilike(bookAssignments.phone, literalLike(term)), ilike(bookAssignments.whatsapp, literalLike(term))) : undefined);
  }
  const phone = term.replace(/\D/g, "");
  if (/^[+\d\s()-]+$/.test(term) && phone.length >= 7) {
    const value = literalLike(phone.length === 12 && phone.startsWith("91") ? phone.slice(2) : phone);
    return or(ilike(bookAssignments.phone, value), ilike(bookAssignments.whatsapp, value));
  }
  // Match each word across the relevant labels; user wildcards remain literal.
  const source = query.tab === "OPEN" ? bookCases.sourceCode : bookReturns.sourceCode;
  return and(...term.split(" ").slice(0, 8).map((word) => sql`concat_ws(' ',
    ${books.bookNumber},${source},${books.editionNameEn},${books.editionNameUr},
    ${bookAssignments.number},${bookReturns.number},${bookAssignments.collectorName},
    ${bookAssignments.collectorCode},${bookAssignments.phone},${bookAssignments.whatsapp},
    ${bookAssignments.address},${bookAssignments.areas}::text) ilike ${literalLike(word)}`));
}
function submissionEditionOptions(tab: ReturnQuery["tab"]) {
  return sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'nameEn',e.name_en,'nameUr',e.name_ur,'bookType',e.edition_book_type)
    order by e.edition_book_type,e.edition_number,e.edition_token_value_paise,e.id)
    from public.master_records e where e.kind='EDITION' and e.deleted_at is null
      and e.edition_book_type in ('REGULAR','TOKEN') and exists (
        select 1 from public.books b
        ${tab === "OPEN" ? sql`join public.book_cases c on c.book_id=b.id
          join public.book_assignments a on a.id=c.assignment_id
          where (c.closed_at is null and b.status in ('ASSIGNED','LEFTOVER_ASSIGNED')
            or exists (select 1 from public.book_returns r where r.case_id=c.id and r.finalized_at is not null and r.deleted_at is null))`
          : sql`join public.book_returns r on r.book_id=b.id
          join public.book_assignments a on a.id=r.assignment_id
          where r.deleted_at is null`}
          and b.edition_id=e.id and b.deleted_at is null and a.deleted_at is null
      )), '[]'::jsonb)`;
}
const openCount = sql<number>`(select count(*)::integer from public.book_cases c where c.assignment_id = ${bookAssignments.id} and c.closed_at is null)`;
const caseColumns = { id: bookCases.id, book: books, assignment: bookAssignments, openCount,
  commissionBasisPoints: collectors.commissionBasisPoints, hasPhoto: sql<boolean>`${people.profilePhotoKey} is not null`,
  submissionId: bookReturns.id, submissionVersion: bookReturns.receiptEntryVersion,
  finalizedAt: bookReturns.finalizedAt, reopenedAt: bookReturns.reopenedAt,
  receiptFrom: bookCases.receiptFrom, receiptTo: bookCases.receiptTo, source: bookCases.source, sourceCode: bookCases.sourceCode };
type CaseRecord = { id: string; book: typeof books.$inferSelect; assignment: typeof bookAssignments.$inferSelect; openCount: number;
  commissionBasisPoints: number | null; hasPhoto: boolean; submissionId: string | null; submissionVersion: number | null;
  finalizedAt: Date | null; reopenedAt: Date | null;
  receiptFrom: number; receiptTo: number; source: "NEW" | "LEFTOVER"; sourceCode: string };
const serializeCase = (row: CaseRecord) => openReturnCaseSchema.parse({ id: row.id, source: row.source, sourceCode: row.sourceCode,
  commissionBasisPoints: row.commissionBasisPoints, hasPhoto: row.hasPhoto, submissionId: row.submissionId,
  submissionVersion: row.submissionVersion,
  submissionStatus: row.finalizedAt ? "CLOSED" : row.reopenedAt ? "REOPENED" : row.submissionId ? "IN_PROGRESS" : "NOT_STARTED",
  book: bookRowSchema.parse({ ...row.book, receiptFrom: row.receiptFrom, receiptTo: row.receiptTo, totalReceipts: row.receiptTo - row.receiptFrom + 1,
    faceValuePaise: row.book.tokenValuePaise === null ? null : (row.receiptTo - row.receiptFrom + 1) * row.book.tokenValuePaise, updatedAt: row.book.updatedAt.toISOString() }),
  assignment: assignmentRowSchema.parse({ ...row.assignment, openCount: row.openCount, updatedAt: row.assignment.updatedAt.toISOString() }) });
const serializeReturn = (row: typeof bookReturns.$inferSelect) => returnRowSchema.parse({ ...row, createdAt: row.createdAt.toISOString(),
  unused: row.finalizedAt !== null && row.outcome === "PARTLY_USED" && row.receiptEntryStatus === "RECONCILED" && row.receiptsUsed === 0 && row.lastUsed === null,
  finalized: row.finalizedAt !== null, reopened: row.finalizedAt === null && row.reopenedAt !== null, submissionVersion: row.receiptEntryVersion });
const liveCase = and(isNull(bookCases.closedAt), isNull(books.deletedAt), isNull(bookAssignments.deletedAt), inArray(books.status, ["ASSIGNED", "LEFTOVER_ASSIGNED"]));
const listedCase = and(isNull(books.deletedAt), isNull(bookAssignments.deletedAt),
  or(liveCase, and(isNotNull(bookCases.closedAt), isNotNull(bookReturns.finalizedAt),
    sql`not (${bookReturns.outcome}='PARTLY_USED' and ${bookReturns.receiptEntryStatus}='RECONCILED'
      and ${bookReturns.receiptsUsed}=0 and ${bookReturns.lastUsed} is null)`)));
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
    const today = indiaToday();
    const where = and(query.collectorId ? eq(bookAssignments.collectorId, query.collectorId) : undefined,
      query.bookType !== "ALL" ? eq(books.bookType, query.bookType) : undefined,
      query.editionId ? eq(books.editionId, query.editionId) : undefined,
      submissionSearch(query)) ?? sql`true`;
    const statusFilter = query.status === "OVERDUE" || query.overdue === "OVERDUE" ? sql`not closed and expected_date<${today}::date`
      : query.status === "CLOSED" ? sql`closed` : query.status === "REOPENED" ? sql`reopened`
        : query.status === "IN_PROGRESS" ? sql`started and not closed and not reopened` : query.status === "NOT_STARTED" ? sql`not started`
          : query.status === "ALL" ? sql`true` : sql`false`;
    const focused = Boolean(query.collectorId);
    const pageSize = focused ? 20 : 8;
    const previewLimit = 3;
    type FundraiserCount = { collectorId: string; assignedBookCount: number; matchingBookCount: number };
    const [result] = await tx.execute<{ data: { total: number; page: number; ids: string[];
      counts: FundraiserCount[]; summary: ReturnListSummary; editions: unknown } }>(sql`
      with assigned_cases as materialized (
        select ${bookCases.id} as id,${bookAssignments.collectorId} as collector_id,
          ${bookAssignments.expectedReturnDate} as expected_date,${books.editionNumber} as edition_number,
          ${books.editionBookNumber} as book_number,${bookCases.receiptFrom} as receipt_from,
          (${bookReturns.id} is not null) as started, (${bookReturns.finalizedAt} is not null) as closed,
          (${bookReturns.reopenedAt} is not null and ${bookReturns.finalizedAt} is null) as reopened, (${where}) as in_scope
        from public.book_cases join public.books on books.id=book_cases.book_id
          join public.book_assignments on book_assignments.id=book_cases.assignment_id
          left join public.book_returns on book_returns.case_id=book_cases.id and book_returns.deleted_at is null
        where ${listedCase}
      ), scoped_cases as (
        select *, (in_scope and (${statusFilter})) as matches from assigned_cases
      ), matching as materialized (
        select * from scoped_cases where matches
      ), profile_counts as (
        select collector_id,count(*)::integer as assigned_count,
          count(*) filter (where matches)::integer as matching_count,
          min(expected_date) filter (where matches) as first_due
        from scoped_cases group by collector_id having count(*) filter (where matches)>0
      ), pagination as (
        select ${focused ? sql`(select count(*)::integer from matching)` : sql`(select count(*)::integer from profile_counts)`} as total
      ), paging as (
        select total,least(${query.page}::integer,greatest(1,ceil(total::numeric/${pageSize})::integer)) as page
        from pagination
      ), page_profiles as (
        select * from profile_counts order by first_due,collector_id
        limit ${focused ? 1 : pageSize}
        offset ${focused ? sql`0` : sql`(select (page-1)*${pageSize} from paging)`}
      ), ranked_cases as (
        select m.*,row_number() over (partition by m.collector_id
          order by m.closed,m.expected_date,m.edition_number nulls last,m.book_number nulls last,m.receipt_from,m.id) as row_position
        from matching m join page_profiles p on p.collector_id=m.collector_id
      )
      select jsonb_build_object('total',total,'page',page,
        'ids',coalesce((select jsonb_agg(id order by expected_date,collector_id,row_position)
          from ranked_cases where ${focused ? sql`row_position between ((select page from paging)-1)*${pageSize}+1 and (select page from paging)*${pageSize}`
            : sql`row_position<=${previewLimit}`}), '[]'::jsonb),
        'counts',coalesce((select jsonb_agg(jsonb_build_object('collectorId',collector_id,
          'assignedBookCount',assigned_count,'matchingBookCount',matching_count) order by first_due,collector_id)
          from page_profiles),'[]'::jsonb),
        'summary',(select jsonb_build_object('records',count(*),'fundraisers',count(distinct collector_id),
          'notStarted',count(*) filter (where not started),'inProgress',count(*) filter (where started and not closed and not reopened),
          'closed',count(*) filter (where closed),'reopened',count(*) filter (where reopened),
          'overdue',count(*) filter (where not closed and expected_date<${today}::date)) from assigned_cases where in_scope),
        'editions',${query.options === "1" ? submissionEditionOptions("OPEN") : sql`null`}
      ) as data from paging`);
    if (!result?.data) throw new AuthFailure("RETURNS_UNAVAILABLE", 503);
    const { total, page, ids, counts, summary } = result.data;
    const rows = ids.length ? await tx.select(caseColumns).from(bookCases).innerJoin(books, eq(books.id, bookCases.bookId))
      .innerJoin(bookAssignments, eq(bookAssignments.id, bookCases.assignmentId))
      .innerJoin(collectors, eq(collectors.personId, bookAssignments.collectorId)).innerJoin(people, eq(people.id, collectors.personId))
      .leftJoin(bookReturns, and(eq(bookReturns.caseId, bookCases.id), isNull(bookReturns.deletedAt)))
      .where(and(listedCase, inArray(bookCases.id, ids)))
      .orderBy(sql`(${bookReturns.finalizedAt} is not null)`, asc(bookAssignments.expectedReturnDate), asc(bookAssignments.collectorId), asc(books.editionNumber), asc(books.editionBookNumber), asc(bookCases.id)) : [];
    const collectorIds = counts.map((item) => item.collectorId);
    const summaries = collectorIds.length ? await tx.select({
      caseId: bookReturns.caseId, collectorId: bookAssignments.collectorId,
      enteredReceiptCount: count(bookReceipts.id),
      collectedPaise: sql<number>`coalesce(sum(${bookReceipts.amountPaise}) filter (where ${bookReceipts.status} = 'VALID'),0)::double precision`,
      collectedCommissionPaise: sql<number>`(case when count(${bookReceipts.id}) filter (where ${bookReceipts.status} = 'VALID')=0 then 0
        else coalesce(max((to_jsonb(${bookReturns})->>'historical_commission_paise')::bigint),
          round(coalesce(sum(${bookReceipts.amountPaise}) filter (where ${bookReceipts.status} = 'VALID'),0)::numeric
            * ${bookReturns.commissionBasisPoints} / 1000000) * 100) end)::double precision`,
    }).from(bookReturns).innerJoin(bookAssignments, eq(bookAssignments.id, bookReturns.assignmentId))
      .innerJoin(books, eq(books.id, bookReturns.bookId))
      .leftJoin(bookReceipts, and(eq(bookReceipts.returnId, bookReturns.id), isNull(bookReceipts.deletedAt)))
      .where(and(inArray(bookAssignments.collectorId, collectorIds), isNull(bookReturns.deletedAt),
        isNull(bookAssignments.deletedAt), isNull(books.deletedAt)))
      .groupBy(bookReturns.id, bookReturns.caseId, bookReturns.commissionBasisPoints, bookAssignments.collectorId) : [];
    const byCase = new Map(summaries.map((summary) => [summary.caseId, {
      enteredReceiptCount: summary.enteredReceiptCount, collectedPaise: summary.collectedPaise,
      collectedCommissionPaise: summary.collectedCommissionPaise,
    }]));
    const fundraiserTotals = new Map(counts.map((item) => [item.collectorId,
      { ...item, collectedPaise: 0, collectedCommissionPaise: 0 }]));
    for (const summary of summaries) {
      const totals = fundraiserTotals.get(summary.collectorId);
      if (totals) { totals.collectedPaise += summary.collectedPaise; totals.collectedCommissionPaise += summary.collectedCommissionPaise; }
    }
    return { rows: rows.map((row) => ({ ...serializeCase(row), ...byCase.get(row.id) })),
      fundraiserTotals: [...fundraiserTotals.values()], total, page, pageSize,
      summary, pagination: focused ? "BOOKS" as const : "FUNDRAISERS" as const, previewLimit,
      ...(query.options === "1" ? { editions: returnEditionOptionsSchema.parse(result.data.editions ?? []) } : {}) };
  });
}
export async function listBookReturns(query: ReturnQuery) {
  return withBooksDatabase(async (tx) => {
    const where = and(isNull(bookReturns.deletedAt), isNull(bookAssignments.deletedAt), isNull(books.deletedAt),
      query.collectorId ? eq(bookAssignments.collectorId, query.collectorId) : undefined,
      query.bookType !== "ALL" ? eq(books.bookType, query.bookType) : undefined,
      query.editionId ? eq(books.editionId, query.editionId) : undefined,
      query.status === "IN_PROGRESS" ? inArray(bookReturns.receiptEntryStatus, ["PENDING", "DRAFT"])
        : query.status === "RECONCILED" || query.status === "FLAGGED" ? eq(bookReturns.receiptEntryStatus, query.status)
          : query.status === "NOT_STARTED" || query.status === "OVERDUE" ? sql`false` : undefined,
      submissionSearch(query));
    const [result] = await tx.select({ total: count(),
      fundraisers: sql<number>`count(distinct ${bookAssignments.collectorId})::integer`,
      inProgress: sql<number>`count(*) filter (where ${bookReturns.receiptEntryStatus} in ('PENDING','DRAFT'))::integer`,
      completed: sql<number>`count(*) filter (where ${bookReturns.receiptEntryStatus}='RECONCILED')::integer`,
      flagged: sql<number>`count(*) filter (where ${bookReturns.receiptEntryStatus}='FLAGGED')::integer`,
      editions: query.options === "1" ? submissionEditionOptions("RETURNED") : sql<null>`null`,
    }).from(bookReturns).innerJoin(bookAssignments, eq(bookAssignments.id, bookReturns.assignmentId))
      .innerJoin(books, eq(books.id, bookReturns.bookId)).where(where);
    const total = result?.total ?? 0; const pageSize = 20; const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.select({ returned: bookReturns }).from(bookReturns)
      .innerJoin(bookAssignments, eq(bookAssignments.id, bookReturns.assignmentId)).innerJoin(books, eq(books.id, bookReturns.bookId))
      .where(where).orderBy(desc(bookReturns.createdAt), asc(bookReturns.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(({ returned }) => serializeReturn(returned)), total, page, pageSize,
      summary: { records: total, fundraisers: result?.fundraisers ?? 0, inProgress: result?.inProgress ?? 0,
        completed: result?.completed ?? 0, flagged: result?.flagged ?? 0 },
      ...(query.options === "1" ? { editions: returnEditionOptionsSchema.parse(result?.editions ?? []) } : {}) };
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

export async function markAssignedBookLost(input: BookLossSubmission) {
  try {
    return await withBooksDatabase(async (tx) => {
      const [row] = await tx.execute(sql`select public.mark_assigned_book_lost(${input.caseId}::uuid, ${input.reason}) as result`);
      if (!row) throw new AuthFailure("RETURNS_UNAVAILABLE", 503);
      return bookLossResultSchema.parse(row.result);
    });
  } catch (error) {
    const failure = returnDatabaseFailure(error, "mark-book-lost");
    if (failure instanceof ReturnFailure && ["42P01", "42703", "42883"].includes(failure.details?.sqlState ?? "")) {
      throw new AuthFailure("BOOK_LOSS_SETUP_REQUIRED", 503);
    }
    throw failure;
  }
}
