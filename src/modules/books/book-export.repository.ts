import "server-only";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { bookAssignments, bookCases, bookReturns, books } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookStockFilters, stockReopened, withBooksDatabase } from "@/modules/books/books.repository";
import { booksQuerySchema } from "@/modules/books/books.schema";
import { assignmentFilters } from "@/modules/books/assignments.repository";
import { assignmentQuerySchema } from "@/modules/books/assignments.schema";
import { listedCase, submissionSearch } from "@/modules/books/returns.repository";
import type { ExcelCell, ExcelColumn, ExcelSheet } from "@/lib/export/xlsx";
import type { BookExportQuery } from "@/modules/books/book-export.schema";

const bookLimit = 5000;
const receiptLimit = 20000;
const exportAssignmentStatus = sql<string>`case
  when book_assignments.id is null then null
  when not exists (
    select 1 from public.book_cases open_case
    where open_case.assignment_id=book_assignments.id and open_case.closed_at is null
      and not exists (select 1 from public.book_returns closed_return
        where closed_return.case_id=open_case.id and closed_return.deleted_at is null and closed_return.finalized_at is not null)
  ) then 'CLOSED'
  when book_assignments.expected_return_date < (now() at time zone 'Asia/Kolkata')::date then 'OVERDUE'
  else 'OPEN'
end`;
const unused = sql<boolean>`(${bookReturns.finalizedAt} is not null and ${bookReturns.outcome}='PARTLY_USED'
  and ${bookReturns.receiptEntryStatus}='RECONCILED' and ${bookReturns.receiptsUsed}=0 and ${bookReturns.lastUsed} is null)`;
const active = sql<boolean>`(${bookCases.id} is not null and ${bookCases.closedAt} is null and ${bookReturns.finalizedAt} is null)`;
const submissionStatus = sql<string>`case when ${books.status}='LOST' then 'LOST'
  when ${bookCases.id} is null then 'IN_STOCK'
  when ${unused} then 'NOT_USED' when ${bookReturns.finalizedAt} is not null then 'CLOSED'
  when ${bookReturns.reopenedAt} is not null then 'REOPENED'
  when ${bookReturns.id} is not null then 'IN_PROGRESS' else 'OPEN' end`;

function statusFilter(query: BookExportQuery) {
  if (query.source === "STOCK" || query.statuses.includes("ALL")) return sql`true`;
  return or(...query.statuses.map((status) => {
    if (status === "OVERDUE") return query.source === "ASSIGNMENTS" ? sql`(${exportAssignmentStatus})='OVERDUE'`
      : sql`${active} and ${bookAssignments.expectedReturnDate} < (now() at time zone 'Asia/Kolkata')::date`;
    if (status === "OPEN" || status === "CLOSED") return query.source === "ASSIGNMENTS"
      ? sql`(${exportAssignmentStatus})=${status}` : sql`(${submissionStatus})=${status}`;
    if (status === "FLAGGED") return eq(bookReturns.receiptEntryStatus, "FLAGGED");
    return sql`(${submissionStatus})=${status}`;
  }));
}

function columns(labels: string[]): ExcelColumn[] {
  return labels.map((label) => ({ label, width: /name|address|areas|remarks/i.test(label) ? 34 : 23, money: label.endsWith("(INR)") }));
}
const bookColumns = columns([
  "Assignment number", "Assignment date", "Expected return date", "Assignment status", "Fundraiser name", "Fundraiser code",
  "Mobile", "WhatsApp", "Address", "Collection areas", "Edition", "Book type", "Token value (INR)", "Book number",
  "Receipt from", "Receipt to", "Source", "Submission number", "Submission status", "Days overdue", "Return date", "Finalized at (IST)",
  "Receipts entered", "Receipts checked", "Cash (INR)", "Digital (INR)", "Cheque (INR)", "Collected (INR)", "Commission (INR)",
  "Net (INR)", "Reported collection (INR)", "Reported cash (INR)", "Reported digital (INR)", "Collection difference (INR)",
  "Cash to hand over (INR)", "Commission given", "Leftover status", "Assigned by", "Stock status",
]);
const receiptColumns = columns([
  "Assignment number", "Fundraiser name", "Fundraiser code", "Edition", "Book number", "Submission number", "Receipt number",
  "Receipt date", "Receipt status", "Checked", "Historical Excel record", "Original Excel row", "Original Excel book number",
  "Original Excel condition", "Anonymous", "Donor name", "Mobile", "Parentage", "Parent / spouse name", "Village / locality",
  "Post office", "Block", "District / area", "State", "PIN", "PAN", "Amount (INR)", "Amount in words", "Payment mode",
  "Reference", "Transaction date", "Donation categories", "Donation heads", "Purpose / detail", "Entered by", "Remarks",
  "UPI app", "Cheque number", "Cheque bank", "Cheque branch", "Cheque date", "Receipt reason", "Donor signature present", "Receiver signature present",
]);
const formattedBook = sql<string>`case when books.edition_number is null then '' else 'ED-'||lpad(books.edition_number::text,greatest(2,length(books.edition_number::text)),'0')||'-' end
  ||case when books.book_type='TOKEN' then 'T-'||(books.token_value_paise/100)::text||'-' else '' end
  ||case when books.edition_book_number is null then books.book_number else 'Book'||books.edition_book_number::text||'/'||books.receipt_from::text end`;

export async function exportBookRecords(query: BookExportQuery): Promise<ExcelSheet[]> {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED", 403);
    const scope = query.source === "STOCK" ? bookStockFilters(booksQuerySchema.parse({ ...query, status: query.stockStatus })) : query.source === "ASSIGNMENTS"
      ? assignmentFilters(assignmentQuerySchema.parse({ ...query, status: "ALL" }))
      : and(isNull(bookAssignments.deletedAt), query.tab === "RETURNED" ? isNotNull(bookReturns.id)
        : query.statuses.includes("NOT_USED") || query.statuses.includes("ALL") ? or(listedCase, unused) : listedCase,
        submissionSearch(query));
    const where = and(scope, isNull(books.deletedAt),
      query.collectorId ? eq(bookAssignments.collectorId, query.collectorId) : undefined,
      query.bookType !== "ALL" ? eq(books.bookType, query.bookType) : undefined,
      query.editionId ? eq(books.editionId, query.editionId) : undefined, statusFilter(query));
    const sourceTables = query.source === "STOCK" ? sql`
      from public.books
      left join lateral (select c.* from public.book_cases c where c.book_id=books.id
        and exists (select 1 from public.book_assignments a where a.id=c.assignment_id and a.deleted_at is null)
        order by (c.closed_at is null) desc,c.created_at desc,c.id desc limit 1) book_cases on true
      left join public.book_assignments on book_assignments.id=book_cases.assignment_id`
      : sql`from public.book_cases join public.book_assignments on book_assignments.id=book_cases.assignment_id
        join public.books on books.id=book_cases.book_id`;
    const [result] = await tx.execute<{ data: { tooLarge: boolean; books: ExcelCell[][]; receipts: ExcelCell[][] } }>(sql`
      with matching as materialized (
        select book_cases.id as case_id,books.id as book_id,book_assignments.id as assignment_id,book_returns.id as return_id
        ${sourceTables}
        left join public.book_returns on book_returns.case_id=book_cases.id and book_returns.deleted_at is null
        where ${where} order by book_assignments.expected_return_date,book_assignments.number,book_cases.receipt_from,book_cases.id
        limit ${bookLimit + 1}
      ), selected as materialized (
        select * from matching where (select count(*) from matching)<=${bookLimit}
      ), receipt_rows as materialized (
        select r.* from public.book_receipts r join selected s on ${query.source === "STOCK" ? sql`s.book_id=r.book_id` : sql`s.return_id=r.return_id`}
        where r.deleted_at is null and exists (select 1 from public.book_returns parent
          join public.book_assignments a on a.id=parent.assignment_id and a.deleted_at is null
          where parent.id=r.return_id and parent.deleted_at is null)
        order by r.return_id,r.receipt_number limit ${receiptLimit + 1}
      ), limits as (
        select (select count(*) from matching)>${bookLimit} or (select count(*) from receipt_rows)>${receiptLimit} as too_large
      ), totals as (
        select return_id,count(*)::integer as entered,count(*) filter (where checked)::integer as checked,
          coalesce(sum(amount_paise) filter (where status='VALID'),0) as collected,
          coalesce(sum(amount_paise) filter (where status='VALID' and data->>'paymentMode'='CASH'),0) as cash,
          coalesce(sum(amount_paise) filter (where status='VALID' and data->>'paymentMode'='DIGITAL'),0) as digital,
          coalesce(sum(amount_paise) filter (where status='VALID' and data->>'paymentMode'='CHEQUE'),0) as cheque
        from receipt_rows group by return_id
      ), book_rows as (
        select book_assignments.number as assignment_number,book_cases.receipt_from,books.receipt_from as stock_receipt_from,
          jsonb_build_array(book_assignments.number,book_assignments.assignment_date,book_assignments.expected_return_date,
            ${exportAssignmentStatus},
            book_assignments.collector_name,book_assignments.collector_code,book_assignments.phone,
            book_assignments.whatsapp,book_assignments.address,
            (select string_agg(area->>'nameEn',', ') from jsonb_array_elements(book_assignments.areas) area),
            books.edition_name_en,books.book_type,books.token_value_paise::numeric/100,${formattedBook},
            ${query.source === "STOCK" ? sql`books.receipt_from,books.receipt_to` : sql`book_cases.receipt_from,book_cases.receipt_to`},
            book_cases.source,book_returns.number,${submissionStatus},
            case when ${active} then greatest(0,(now() at time zone 'Asia/Kolkata')::date-book_assignments.expected_return_date) else 0 end,
            book_returns.return_date,to_char(book_returns.finalized_at at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS'),
            coalesce(t.entered,0),coalesce(t.checked,0),coalesce(t.cash,0)::numeric/100,
            coalesce(t.digital,0)::numeric/100,coalesce(t.cheque,0)::numeric/100,coalesce(t.collected,0)::numeric/100,
            commission.amount::numeric/100,(coalesce(t.collected,0)-commission.amount)::numeric/100,
            book_returns.total_paise::numeric/100,book_returns.cash_paise::numeric/100,book_returns.digital_paise::numeric/100,
            (book_returns.total_paise-coalesce(t.collected,0))::numeric/100,book_returns.cash_handover_paise::numeric/100,
            book_returns.commission_given,
            (select string_agg(l.status,', ') from public.leftover_books l where l.return_id=book_returns.id and l.deleted_at is null),
            book_assignments.assigned_by_name,
            case when ${stockReopened} then 'REOPENED' else books.status end) as cells
        from selected s left join public.book_cases on book_cases.id=s.case_id
        left join public.book_assignments on book_assignments.id=s.assignment_id join public.books on books.id=s.book_id
        left join public.book_returns on book_returns.id=s.return_id left join totals t on t.return_id=s.return_id
        cross join lateral (select case when coalesce(t.collected,0)=0 then 0 else
          coalesce((to_jsonb(book_returns)->>'historical_commission_paise')::bigint,
            round(t.collected::numeric*book_returns.commission_basis_points/1000000)*100) end as amount) commission
        where not (select too_large from limits)
      ), receipt_details as (
        select book_assignments.number as assignment_number,r.receipt_number,
          jsonb_build_array(book_assignments.number,book_assignments.collector_name,book_assignments.collector_code,
            books.edition_name_en,${formattedBook},book_returns.number,r.receipt_number,r.data->>'date',r.status,r.checked,
            imported.source_row is not null,imported.source_row,imported.source_data->>'Book No.',imported.source_data->>'Book Condition',
            coalesce((r.data->>'anonymous')::boolean,false),r.data->>'donorName',r.phone,r.data->>'parentage',r.data->>'parentName',
            r.data->>'village',r.data->>'postOffice',r.data->>'block',r.data->>'district',r.data->>'state',r.data->>'pin',r.data->>'pan',
            r.amount_paise::numeric/100,r.data->>'amountWords',r.data->>'paymentMode',r.data->>'reference',r.data->>'transactionDate',
            heads.categories,heads.names,heads.purposes,r.entry_by_name,r.data->>'remarks',
            r.labels->(r.data->>'upiAppId')->>'nameEn',r.data->>'chequeNumber',
            r.labels->(r.data->>'bankId')->>'nameEn',r.data->>'branch',r.data->>'chequeDate',
            r.labels->(r.data->>'reasonId')->>'nameEn',
            coalesce((r.data->>'donorSigned')::boolean,false),coalesce((r.data->>'receiverSigned')::boolean,false)) as cells
        from receipt_rows r join selected s on ${query.source === "STOCK" ? sql`s.book_id=r.book_id` : sql`s.return_id=r.return_id`}
        join public.book_returns on book_returns.id=r.return_id and book_returns.deleted_at is null
        join public.book_assignments on book_assignments.id=book_returns.assignment_id and book_assignments.deleted_at is null
        join public.books on books.id=s.book_id
        left join lateral (select l.source_row,l.source_data from public.legacy_collection_imports l
          where l.receipt_id=r.id and l.return_id=r.return_id and l.book_id=r.book_id
            and l.assumed_receipt_number=r.receipt_number and l.status='IMPORTED' order by l.source_row limit 1) imported on true
        left join lateral (select string_agg(coalesce(r.labels->(h->>'categoryId')->>'nameEn',category.name_en),', ') as categories,
          string_agg(coalesce(r.labels->(h->>'headId')->>'nameEn',head.name_en),', ') as names,
          string_agg(nullif(h->>'purpose',''),'; ') as purposes
          from jsonb_array_elements(r.data->'heads') h
          left join public.master_records category on category.id=nullif(h->>'categoryId','')::uuid
          left join public.master_records head on head.id=nullif(h->>'headId','')::uuid) heads on true
        where not (select too_large from limits)
      )
      select jsonb_build_object('tooLarge',too_large,
        'books',coalesce((select jsonb_agg(cells order by ${query.source === "STOCK" ? sql`stock_receipt_from` : sql`assignment_number,receipt_from`}) from book_rows),'[]'::jsonb),
        'receipts',coalesce((select jsonb_agg(cells order by assignment_number,receipt_number) from receipt_details),'[]'::jsonb)) as data from limits
    `);
    if (!result?.data) throw new AuthFailure("BOOK_EXPORT_FAILED", 503);
    if (result.data.tooLarge) throw new AuthFailure("BOOK_EXPORT_TOO_LARGE", 413);
    if (!result.data.books.length) throw new AuthFailure("BOOK_EXPORT_EMPTY", 404);
    return [
      { name: "Books", columns: bookColumns, rows: result.data.books },
      { name: "Receipts", columns: receiptColumns, rows: result.data.receipts },
      { name: "Export details", columns: columns(["Filter", "Value"]), rows: [
        ["Exported at (UTC)", new Date().toISOString()], ["Source screen", query.source === "STOCK" ? "Book Stock" : query.source === "ASSIGNMENTS" ? "Assign Books" : "Book Submission"],
        ["Selected statuses", query.source === "STOCK" ? query.stockStatus.replaceAll("_", " ") : query.statuses.map((status) => status.replaceAll("_", " ")).join(", ")],
        ["Search", query.search], ["Book type", query.bookType], ["Edition scope", query.editionId ? "Selected edition from the screen" : "All editions"],
        ["Token value (INR)", query.tokenValue || "All values"],
        ["Fundraiser scope", query.collectorId ? "Selected fundraiser from the screen" : "All fundraisers"],
        ["Book rows", result.data.books.length], ["Receipt rows", result.data.receipts.length],
        ["Amounts", "INR. Book collections come from saved valid receipts. Exact recorded historical commissions are retained."],
        ["Status", "Overdue means an open book past its expected return date. Assignment and submission statuses are shown separately."],
      ] },
    ];
  });
}
