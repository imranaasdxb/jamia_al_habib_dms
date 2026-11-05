import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { historicalCollectionsResponseSchema } from "@/modules/books/historical-collections.schema";
import type { HistoricalCollectionQuery } from "@/modules/books/historical-collections.schema";

export async function listHistoricalCollections(query: HistoricalCollectionQuery) {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const term = `%${query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const [result] = await tx.execute<{ payload: unknown }>(sql`
      with matching as materialized (
        select * from public.all_historical_collection_rows() h
        where ${query.collectorId ? sql`h.person_id=${query.collectorId}::uuid` : sql`true`}
          and ${query.editionId ? sql`h.edition_id=${query.editionId}::uuid` : sql`true`}
          and ${query.bookType === "ALL" ? sql`true` : sql`h.book_type=${query.bookType}`}
          and ${query.search ? sql`concat_ws(' ',h.fundraiser_name,h.fundraiser_code,h.book_number,h.original_book,h.edition_name,h.collection_area,h.source_row::text) ilike ${term}` : sql`true`}
      ), totals as (
        select count(*)::integer as total,coalesce(sum(amount_paise),0) as collected,
          coalesce(sum(commission_paise),0) as commission from matching
      ), paging as (
        select *,least(${query.page}::integer,greatest(1,ceil(total/20.0)::integer)) as page from totals
      ), page_rows as (
        select * from matching order by source_row limit 20 offset(select (page-1)*20 from paging)
      )
      select jsonb_build_object('data',coalesce((select jsonb_agg(jsonb_build_object(
        'sourceRow',source_row,'fundraiser',fundraiser_name,'code',fundraiser_code,'book',book_number,
        'originalBook',original_book,'receiptFrom',receipt_from,'receiptTo',receipt_to,
        'assignmentId',assignment_id,'returnId',return_id,'receiptNumber',receipt_number,'linkStatus',link_status,
        'edition',edition_name,'bookType',book_type,'tokenValuePaise',token_value_paise,
        'date',collection_date,'area',collection_area,'condition',book_condition,
        'collectedPaise',amount_paise,'commissionPaise',commission_paise) order by source_row) from page_rows),'[]'::jsonb),
        'meta',jsonb_build_object('total',total,'page',page,'pageSize',20,
          'collectedPaise',collected,'commissionPaise',commission)) as payload from paging`);
    return historicalCollectionsResponseSchema.parse(result?.payload);
  });
}
