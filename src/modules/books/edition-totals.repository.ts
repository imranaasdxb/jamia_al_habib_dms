import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { editionCollectionTotalsSchema } from "@/modules/books/edition-totals.schema";

export async function getEditionCollectionTotals() {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "SUPER_ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const [result] = await tx.execute<{ data: unknown }>(sql`
      with submissions as (
        select b.book_type,
          sum(receipt.amount_paise) as collected,
          coalesce(max((to_jsonb(r)->>'historical_commission_paise')::bigint),
            round(sum(receipt.amount_paise)::numeric*r.commission_basis_points/1000000)*100) as commission
        from public.books b
        join public.master_records edition on edition.id=b.edition_id and edition.kind='EDITION' and edition.deleted_at is null
        join public.book_returns r on r.book_id=b.id and r.deleted_at is null
        join public.book_receipts receipt on receipt.return_id=r.id and receipt.book_id=b.id
          and receipt.deleted_at is null and receipt.status='VALID'
        where b.deleted_at is null
        group by r.id,b.book_type,r.commission_basis_points
      ), financial_rows as (
        select * from submissions
        union all
        select book_type,coalesce(amount_paise,0),coalesce(commission_paise,0)
        from public.recorded_historical_collections()
      )
      select jsonb_build_object(
        'total',jsonb_build_object('collectedPaise',coalesce(sum(collected),0),'commissionPaise',coalesce(sum(commission),0)),
        'regular',jsonb_build_object('collectedPaise',coalesce(sum(collected) filter (where book_type='REGULAR'),0),
          'commissionPaise',coalesce(sum(commission) filter (where book_type='REGULAR'),0)),
        'token',jsonb_build_object('collectedPaise',coalesce(sum(collected) filter (where book_type='TOKEN'),0),
          'commissionPaise',coalesce(sum(commission) filter (where book_type='TOKEN'),0))
      ) as data from financial_rows`);
    return editionCollectionTotalsSchema.parse(result?.data);
  });
}

