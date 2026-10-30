import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { editionBookPageSchema, editionOverviewSchema } from "@/modules/books/edition-summary.schema";
import type { EditionSummaryQuery } from "@/modules/books/edition-summary.schema";

export async function getEditionSummary(id: string, query: EditionSummaryQuery) {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "SUPER_ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const overview = query.view === "overview";
    const term = `%${query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const numeric = /^\d{1,10}$/.test(query.search) && Number(query.search) <= 2147483647 ? Number(query.search) : null;
    const [result] = await tx.execute<{ data: unknown }>(sql`
      with edition as (
        select id,code,name_en,name_ur,edition_number,edition_book_type,edition_token_value_paise,printing_year
        from public.master_records where id=${id}::uuid and kind='EDITION' and deleted_at is null
      ), edition_books as materialized (
        select b.id,b.book_number,b.edition_book_number,b.receipt_from,b.receipt_to,b.total_receipts,b.status
        from public.books b join edition e on b.edition_id=e.id where b.deleted_at is null
      ), filtered as (
        select * from edition_books b where ${query.status === "ALL" ? sql`true` : sql`b.status=${query.status}`}
          and ${!query.search ? sql`true` : sql`(b.book_number ilike ${term} or b.edition_book_number::text=${query.search}
            or ${numeric}::bigint between b.receipt_from and b.receipt_to)`}
      ), paging as (
        select count(*)::integer as total,least(${query.page}::integer,greatest(1,ceil(count(*)/20.0)::integer)) as page from filtered
      ), page_books as (
        select * from filtered order by edition_book_number nulls last,receipt_from,id
        limit 20 offset (select (page-1)*20 from paging)
      ), scope_books as (
        select * from ${overview ? sql`edition_books` : sql`page_books`}
      ), submission_totals as (
        select r.book_id,r.id as return_id,
          count(receipt.id)::integer as entered,count(*) filter (where receipt.checked)::integer as checked,
          count(*) filter (where receipt.status='CANCELLED')::integer as cancelled,
          count(*) filter (where receipt.status in ('TORN','LOST','BLANK'))::integer as damaged,
          coalesce(sum(receipt.amount_paise) filter (where receipt.status='VALID'),0) as collected,
          coalesce(sum(receipt.amount_paise) filter (where receipt.status='VALID' and r.finalized_at is not null),0) as finalized,
          coalesce(sum(receipt.amount_paise) filter (where receipt.status='VALID' and receipt.data->>'paymentMode'='CASH'),0) as cash,
          coalesce(sum(receipt.amount_paise) filter (where receipt.status='VALID' and receipt.data->>'paymentMode'='DIGITAL'),0) as digital,
          coalesce(sum(receipt.amount_paise) filter (where receipt.status='VALID' and receipt.data->>'paymentMode'='CHEQUE'),0) as cheque,
          case when count(receipt.id) filter (where receipt.status='VALID')=0 then 0
            else coalesce(max((to_jsonb(r)->>'historical_commission_paise')::bigint),
              round(coalesce(sum(receipt.amount_paise) filter (where receipt.status='VALID'),0)::numeric
                * r.commission_basis_points/1000000)*100) end as commission
        from scope_books b join public.book_returns r on r.book_id=b.id and r.deleted_at is null
        join public.book_receipts receipt on receipt.return_id=r.id and receipt.book_id=b.id and receipt.deleted_at is null
        group by r.id,r.book_id,r.commission_basis_points
      ), book_totals as (
        select book_id,sum(entered) as entered,sum(checked) as checked,sum(cancelled) as cancelled,sum(damaged) as damaged,
          sum(collected) as collected,sum(finalized) as finalized,sum(cash) as cash,sum(digital) as digital,
          sum(cheque) as cheque,sum(commission) as commission
        from submission_totals group by book_id
      ), book_page as (
        select jsonb_build_object('rows',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',b.id,'number',b.book_number,'ordinal',b.edition_book_number,'receiptFrom',b.receipt_from,'receiptTo',b.receipt_to,'status',b.status,
            'fundraiser',coalesce(current_assignment.collector_name,recent.collector_name),'submissionId',recent.id,
            'entered',coalesce(t.entered,0),'collectedPaise',coalesce(t.collected,0),'cashPaise',coalesce(t.cash,0),
            'digitalPaise',coalesce(t.digital,0),'chequePaise',coalesce(t.cheque,0),'commissionPaise',coalesce(t.commission,0),
            'netPaise',coalesce(t.collected,0)-coalesce(t.commission,0)
          ) order by b.edition_book_number nulls last,b.receipt_from,b.id)
          from page_books b left join book_totals t on t.book_id=b.id
          left join lateral (select r.id,r.collector_name from public.book_returns r
            where r.book_id=b.id and r.deleted_at is null order by r.created_at desc,r.id desc limit 1) recent on true
          left join lateral (select a.collector_name from public.book_cases c
            join public.book_assignments a on a.id=c.assignment_id and a.deleted_at is null
            where c.book_id=b.id and c.closed_at is null limit 1) current_assignment on true
        ),'[]'::jsonb),'total',p.total,'page',p.page,'pageSize',20) as value from paging p
      )
      select case when not exists(select 1 from edition) then null else ${overview ? sql`
        jsonb_build_object('edition',(select jsonb_build_object('id',id,'code',code,'nameEn',name_en,'nameUr',name_ur,
          'number',edition_number,'bookType',edition_book_type,'tokenValuePaise',edition_token_value_paise,'printingYear',printing_year) from edition),
          'totals',jsonb_build_object(
            'books',(select count(*) from edition_books),'inStock',(select count(*) from edition_books where status='IN_STOCK'),
            'assigned',(select count(*) from edition_books where status in ('ASSIGNED','LEFTOVER_ASSIGNED')),
            'partlyUsed',(select count(*) from edition_books where status='PARTLY_USED'),'closed',(select count(*) from edition_books where status='CLOSED'),
            'flagged',(select count(*) from edition_books where status='FLAGGED'),'lost',(select count(*) from edition_books where status='LOST'),
            'receipts',(select coalesce(sum(total_receipts),0) from edition_books),
            'entered',coalesce(sum(entered),0),'checked',coalesce(sum(checked),0),'cancelled',coalesce(sum(cancelled),0),'damaged',coalesce(sum(damaged),0),
            'collectedPaise',coalesce(sum(collected),0),'finalizedPaise',coalesce(sum(finalized),0),
            'cashPaise',coalesce(sum(cash),0),'digitalPaise',coalesce(sum(digital),0),'chequePaise',coalesce(sum(cheque),0),
            'commissionPaise',coalesce(sum(commission),0),'netPaise',coalesce(sum(collected),0)-coalesce(sum(commission),0)),
          'books',(select value from book_page))` : sql`(select value from book_page)`}
        end as data ${overview ? sql`from book_totals` : sql``}`);
    if (!result?.data) throw new AuthFailure("EDITION_SUMMARY_NOT_FOUND", 404);
    return overview ? editionOverviewSchema.parse(result.data) : editionBookPageSchema.parse(result.data);
  });
}
