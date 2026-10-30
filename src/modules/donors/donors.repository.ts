import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { donorDirectorySchema, donorHistorySchema } from "@/modules/donors/donors.schema";
import type { DonorQuery } from "@/modules/donors/donors.schema";

const pattern = (value: string) => `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

// Both endpoints share the same filters and identity rules. Every join is one-to-one;
// assignment areas are never expanded into rows, which would duplicate donations.
function receiptSource(query: DonorQuery) {
  const conditions = [sql`receipt.deleted_at is null and receipt.status = 'VALID' and receipt.amount_paise > 0`,
    sql`returned.deleted_at is null and book.deleted_at is null and assigned.deleted_at is null`];
  if (query.bookType !== "ALL") conditions.push(sql`book.book_type = ${query.bookType}`);
  if (query.payment !== "ALL") conditions.push(sql`receipt.data->>'paymentMode' = ${query.payment}`);
  if (query.checked !== "ALL") conditions.push(sql`receipt.checked = ${query.checked === "CHECKED"}`);
  if (query.from) conditions.push(sql`coalesce(nullif(receipt.data->>'date', ''), returned.return_date::text) >= ${query.from}`);
  if (query.to) conditions.push(sql`coalesce(nullif(receipt.data->>'date', ''), returned.return_date::text) <= ${query.to}`);
  const filters = [sql`true`];
  if (query.kind !== "ALL") filters.push(sql`kind = ${query.kind}`);
  if (query.area) filters.push(sql`concat_ws(' ', area, state) ilike ${pattern(query.area)}`);
  if (query.search) filters.push(sql`concat_ws(' ', name, phone, area, state) ilike ${pattern(query.search)}`);
  return sql`
    raw_receipts as materialized (
      select receipt.id, receipt.return_id, receipt.receipt_number, receipt.amount_paise, receipt.checked, receipt.updated_at,
        coalesce(receipt.data->>'paymentMode', 'CASH') as payment,
        coalesce(nullif(receipt.data->>'date', ''), returned.return_date::text) as donation_date,
        case when receipt.data->>'anonymous' = 'true' then 'ANONYMOUS'
          when nullif(btrim(receipt.data->>'donorName'), '') is not null then 'NAMED' else 'UNRECORDED' end as kind,
        case when receipt.data->>'anonymous' = 'true' then ''
          else regexp_replace(btrim(coalesce(receipt.data->>'donorName', '')), '[[:space:]]+', ' ', 'g') end as name,
        case when receipt.data->>'anonymous' = 'true' then ''
          else regexp_replace(coalesce(nullif(receipt.phone, ''), receipt.data->>'phone', ''), '[^0-9]', '', 'g') end as raw_phone,
        coalesce(nullif(btrim(receipt.data->>'district'), ''), nullif(btrim(receipt.data->>'village'), '')) as recorded_area,
        nullif(btrim(receipt.data->>'state'), '') as recorded_state,
        case when nullif(btrim(receipt.data->>'district'), '') is null
          and nullif(btrim(receipt.data->>'village'), '') is null and receipt.version = 1
          and receipt.data->>'remarks' like 'HISTORICAL SUMMARY%'
          then public.receipt_historical_location(receipt.id) else '{}'::jsonb end as historical_location,
        case when jsonb_array_length(assigned.areas) = 1 then assigned.areas->0->>'nameEn' else '' end as assigned_area,
        book.book_number, book.edition_name_en, assigned.collector_name
      from public.book_receipts receipt
      join public.book_returns returned on returned.id = receipt.return_id and returned.book_id = receipt.book_id
      join public.books book on book.id = receipt.book_id
      join public.book_assignments assigned on assigned.id = returned.assignment_id
      where ${sql.join(conditions, sql` and `)}
    ), located as (
      select *, case when raw_phone ~ '^[6-9][0-9]{9}$' then raw_phone else '' end as phone,
        coalesce(recorded_area, nullif(historical_location->>'district', ''),
          nullif(historical_location->>'state', ''), assigned_area, '') as area,
        coalesce(recorded_state, historical_location->>'state', '') as state
      from raw_receipts
    ), identified as (
      select *, md5(case when kind = 'NAMED' and phone <> ''
        then jsonb_build_array(lower(name), phone)::text else id::text end) as donor_key
      from located
    ), filtered as materialized (select * from identified where ${sql.join(filters, sql` and `)})`;
}

function checkRole(role: string) {
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
}

export async function readDonorDirectory(query: DonorQuery) {
  return withBooksDatabase(async (tx, actor) => {
    checkRole(actor.role);
    const order = query.sort === "RECENT" ? sql`last_date desc, donor_key`
      : query.sort === "NAME" ? sql`kind, lower(name), donor_key`
      : query.sort === "REPEAT" ? sql`receipts desc, collected desc, donor_key` : sql`collected desc, donor_key`;
    const [result] = await tx.execute<{ payload: unknown }>(sql`
      with ${receiptSource(query)}, grouped as materialized (
        select donor_key, kind,
          (array_agg(name order by donation_date desc, updated_at desc, id))[1] as name,
          max(phone) as phone, (array_agg(area order by donation_date desc, updated_at desc, id))[1] as area,
          (array_agg(state order by donation_date desc, updated_at desc, id))[1] as state,
          sum(amount_paise) as collected, count(*)::integer as receipts, max(donation_date) as last_date
        from filtered group by donor_key, kind
      ), areas as (
        select lower(area) as area_key, lower(state) as state_key, min(area) as name, min(state) as state,
          sum(amount_paise) as collected, count(*)::integer as receipts
        from filtered where area <> '' group by lower(area), lower(state)
      ), totals as (
        select coalesce(sum(amount_paise), 0) as collected, count(*)::integer as receipts,
          coalesce(sum(amount_paise) filter (where kind = 'ANONYMOUS'), 0) as anonymous,
          coalesce(sum(amount_paise) filter (where kind = 'UNRECORDED'), 0) as unrecorded,
          coalesce(sum(amount_paise) filter (where payment = 'CASH'), 0) as cash,
          coalesce(sum(amount_paise) filter (where payment = 'DIGITAL'), 0) as digital,
          coalesce(sum(amount_paise) filter (where payment = 'CHEQUE'), 0) as cheque
        from filtered
      ), stats as (
        select count(*)::integer as total, count(*) filter (where kind = 'NAMED')::integer as named,
          count(*) filter (where kind = 'NAMED' and receipts > 1)::integer as repeat from grouped
      ), paging as (
        select total, greatest(1, least(${query.page}, greatest(1, ceil(total::numeric / 20)::integer))) as page from stats
      ), page_rows as (
        select *, row_number() over (order by ${order}) as position from grouped
        order by ${order} limit 20 offset (select (page - 1) * 20 from paging)
      )
      select jsonb_build_object('data', jsonb_build_object(
        'summary', jsonb_build_object('collectedPaise', totals.collected, 'receipts', totals.receipts,
          'namedDonors', stats.named, 'repeatDonors', stats.repeat,
          'anonymousPaise', totals.anonymous, 'unrecordedPaise', totals.unrecorded,
          'cashPaise', totals.cash, 'digitalPaise', totals.digital, 'chequePaise', totals.cheque,
          'topDonor', (select jsonb_build_object('name', name, 'collectedPaise', collected, 'receipts', receipts)
            from grouped where kind = 'NAMED' order by collected desc, donor_key limit 1),
          'topArea', (select jsonb_build_object('name', name, 'state', state, 'collectedPaise', collected, 'receipts', receipts)
            from areas order by collected desc, area_key, state_key limit 1)),
        'rows', coalesce((select jsonb_agg(jsonb_build_object('key', donor_key, 'kind', kind, 'name', name, 'phone', phone,
          'area', area, 'state', state, 'collectedPaise', collected, 'receipts', receipts, 'lastDate', last_date) order by position) from page_rows), '[]'::jsonb)),
        'meta', jsonb_build_object('total', paging.total, 'page', paging.page, 'pageSize', 20)) as payload
      from totals cross join stats cross join paging`);
    return donorDirectorySchema.parse(result?.payload);
  });
}

export async function readDonorHistory(key: string, query: DonorQuery) {
  return withBooksDatabase(async (tx, actor) => {
    checkRole(actor.role);
    const [result] = await tx.execute<{ payload: unknown }>(sql`
      with ${receiptSource(query)}, matches as materialized (select * from filtered where donor_key = ${key}),
      paging as (select count(*)::integer as total,
        greatest(1, least(${query.page}, greatest(1, ceil(count(*)::numeric / 20)::integer))) as page from matches),
      page_rows as (select * from matches order by donation_date desc, updated_at desc, id
        limit 20 offset (select (page - 1) * 20 from paging))
      select jsonb_build_object('data', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'returnId', return_id, 'number', receipt_number, 'bookNumber', book_number,
        'editionName', edition_name_en, 'fundraiser', collector_name, 'date', donation_date,
        'amountPaise', amount_paise,
        'payment', payment,
        'checked', checked, 'area', area, 'state', state) order by donation_date desc, updated_at desc, id) from page_rows), '[]'::jsonb),
        'meta', jsonb_build_object('total', total, 'page', page, 'pageSize', 20)) as payload from paging`);
    return donorHistorySchema.parse(result?.payload);
  });
}
