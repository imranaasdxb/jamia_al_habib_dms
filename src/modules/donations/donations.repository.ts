import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { donationDetailSchema, donationOptionsSchema, donationPageSchema } from "@/modules/donations/donations.schema";
import type { DonationQuery } from "@/modules/donations/donations.schema";
const pattern = (value: string) => `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
function roleCheck(role: string) {
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
}
const headsArray = sql`case when jsonb_typeof(receipt.data->'heads') = 'array' then receipt.data->'heads' else '[]'::jsonb end`;

export async function listDonations(query: DonationQuery) {
  return withBooksDatabase(async (tx, actor) => {
    roleCheck(actor.role);
    const where = [sql`receipt.deleted_at is null`];
    if (query.status !== "ALL") where.push(sql`receipt.status = ${query.status}`);
    if (query.bookType !== "ALL") where.push(sql`book.book_type = ${query.bookType}`);
    if (query.editionId) where.push(sql`book.edition_id = ${query.editionId}::uuid`);
    if (query.payment !== "ALL") where.push(sql`receipt.data->>'paymentMode' = ${query.payment}`);
    if (query.checked !== "ALL") where.push(sql`receipt.checked = ${query.checked === "CHECKED"}`);
    if (query.stage === "DRAFT") where.push(sql`returned.finalized_at is null`);
    if (query.stage === "FINALIZED") where.push(sql`returned.finalized_at is not null`);
    if (query.stage === "FLAGGED") where.push(sql`returned.receipt_entry_status = 'FLAGGED'`);
    if (query.from) where.push(sql`coalesce(nullif(receipt.data->>'date',''), returned.return_date::text) >= ${query.from}`);
    if (query.to) where.push(sql`coalesce(nullif(receipt.data->>'date',''), returned.return_date::text) <= ${query.to}`);
    if (query.categoryId || query.headId) where.push(sql`exists (
      select 1 from jsonb_array_elements(${headsArray}) item
      where ${query.categoryId ? sql`item->>'categoryId' = ${query.categoryId}` : sql`true`}
        and ${query.headId ? sql`item->>'headId' = ${query.headId}` : sql`true`}
    )`);
    const filters = [sql`true`];
    if (query.kind !== "ALL") filters.push(sql`kind = ${query.kind}`);
    if (query.search) filters.push(sql`concat_ws(' ',name,phone,book_number,edition_en,collector_name,collector_code,receipt_number::text) ilike ${pattern(query.search)}`);
    if (query.area) filters.push(sql`concat_ws(' ',coalesce(recorded_area,nullif(filtered_location->>'district',''),
      nullif(filtered_location->>'state',''),nullif(assigned_area,''),''),coalesce(recorded_state,filtered_location->>'state','')) ilike ${pattern(query.area)}`);
    const order = query.sort === "HIGHEST" ? sql`case when status = 'VALID' then amount_paise end desc nulls last,donation_date desc,id`
      : query.sort === "OLDEST" ? sql`donation_date,id` : sql`donation_date desc,updated_at desc,id`;
    const [result] = await tx.execute<{ payload: unknown }>(sql`
      with source as (
        select receipt.id,receipt.return_id,receipt.receipt_number,receipt.version,receipt.status,receipt.amount_paise,
          receipt.checked,receipt.updated_at,receipt.labels,${headsArray} as heads,
          coalesce(nullif(receipt.data->>'date',''),returned.return_date::text) as donation_date,
          coalesce(nullif(receipt.data->>'paymentMode',''),'CASH') as payment,
          case when receipt.data->>'anonymous' = 'true' then 'ANONYMOUS'
            when nullif(btrim(receipt.data->>'donorName'),'') is not null then 'NAMED' else 'UNRECORDED' end as kind,
          case when receipt.data->>'anonymous' = 'true' then '' else coalesce(receipt.data->>'donorName','') end as name,
          case when receipt.data->>'anonymous' = 'true' then '' else coalesce(nullif(receipt.phone,''),receipt.data->>'phone','') end as phone,
          coalesce(nullif(btrim(receipt.data->>'district'),''),nullif(btrim(receipt.data->>'village'),'')) as recorded_area,
          nullif(btrim(receipt.data->>'state'),'') as recorded_state,
          receipt.version = 1 and coalesce(receipt.data->>'remarks','') like 'HISTORICAL SUMMARY%' as historical,
          case when ${Boolean(query.area)} and receipt.version = 1
            and coalesce(receipt.data->>'remarks','') like 'HISTORICAL SUMMARY%'
            and coalesce(btrim(receipt.data->>'district'),'') = '' and coalesce(btrim(receipt.data->>'village'),'') = ''
            then public.receipt_historical_location(receipt.id) else '{}'::jsonb end as filtered_location,
          case when jsonb_array_length(assigned.areas) = 1 then assigned.areas->0->>'nameEn' else '' end as assigned_area,
          returned.finalized_at is not null as finalized, returned.receipt_entry_status = 'FLAGGED' as flagged,
          book.book_number,book.edition_number,book.edition_book_number,book.receipt_from,book.edition_name_en as edition_en,
          book.edition_name_ur as edition_ur,book.book_type,book.token_value_paise,
          assigned.collector_name,assigned.collector_code
        from public.book_receipts receipt
        join public.book_returns returned on returned.id = receipt.return_id and returned.book_id = receipt.book_id and returned.deleted_at is null
        join public.books book on book.id = receipt.book_id and book.deleted_at is null
        join public.book_assignments assigned on assigned.id = returned.assignment_id and assigned.deleted_at is null
        where ${sql.join(where,sql` and `)}
      ), matching as materialized (
        select * from source where ${sql.join(filters,sql` and `)}
      ), summary as (
        select count(*)::integer as total,
          count(*) filter(where status='VALID')::integer as valid,
          count(*) filter(where status='VALID' and checked)::integer as checked,
          count(*) filter(where status='CANCELLED')::integer as cancelled,
          count(*) filter(where status in ('TORN','LOST','BLANK'))::integer as damaged,
          coalesce(sum(amount_paise) filter(where status='VALID'),0) as collected,
          coalesce(sum(amount_paise) filter(where status='VALID' and payment='CASH'),0) as cash,
          coalesce(sum(amount_paise) filter(where status='VALID' and payment='DIGITAL'),0) as digital,
          coalesce(sum(amount_paise) filter(where status='VALID' and payment='CHEQUE'),0) as cheque,
          coalesce(sum(amount_paise) filter(where status='VALID' and not finalized),0) as draft,
          coalesce(sum(amount_paise) filter(where status='VALID' and finalized),0) as finalized
        from matching
      ), paging as (
        select total,least(${query.page}::integer,greatest(1,ceil(total/20.0)::integer)) as page from summary
      ), page_rows as (
        select * from matching order by ${order} limit 20 offset(select(page-1)*20 from paging)
      ), located as (
        select p.*,case when p.recorded_area is null and p.historical then
          case when ${Boolean(query.area)} then p.filtered_location else public.receipt_historical_location(p.id) end
          else '{}'::jsonb end as historical_location
        from page_rows p
      )
      select jsonb_build_object('data',jsonb_build_object(
        'summary',jsonb_build_object('collectedPaise',s.collected,'cashPaise',s.cash,'digitalPaise',s.digital,'chequePaise',s.cheque,
          'draftPaise',s.draft,'finalizedPaise',s.finalized,'receipts',s.total,'valid',s.valid,'checked',s.checked,'cancelled',s.cancelled,'damaged',s.damaged),
        'rows',coalesce((select jsonb_agg(jsonb_build_object(
          'id',id,'returnId',return_id,'number',receipt_number,'version',version,'date',donation_date,
          'status',status,'amountPaise',amount_paise,'checked',checked,'payment',payment,'kind',kind,'name',name,'phone',phone,
          'area',coalesce(recorded_area,nullif(historical_location->>'district',''),nullif(historical_location->>'state',''),nullif(assigned_area,''),''),
          'state',coalesce(recorded_state,historical_location->>'state',''),'finalized',finalized,'flagged',flagged,
          'book',jsonb_build_object('number',book_number,'ordinal',edition_book_number,'editionNumber',edition_number,'receiptFrom',receipt_from,
            'editionEn',edition_en,'editionUr',edition_ur,'type',book_type,'tokenValuePaise',token_value_paise),
          'fundraiser',jsonb_build_object('name',collector_name,'code',collector_code),
          'headCount',jsonb_array_length(heads),
          'head',jsonb_build_object(
            'nameEn',case when jsonb_array_length(heads)=1 then coalesce(labels->(heads->0->>'headId')->>'nameEn',
              (select name_en from public.master_records where id::text=heads->0->>'headId'),'') else '' end,
            'nameUr',case when jsonb_array_length(heads)=1 then coalesce(labels->(heads->0->>'headId')->>'nameUr',
              (select name_ur from public.master_records where id::text=heads->0->>'headId'),'') else '' end),
          'category',jsonb_build_object(
            'nameEn',case when jsonb_array_length(heads)=1 then coalesce(labels->(heads->0->>'categoryId')->>'nameEn',
              (select name_en from public.master_records where id::text=heads->0->>'categoryId'),'') else '' end,
            'nameUr',case when jsonb_array_length(heads)=1 then coalesce(labels->(heads->0->>'categoryId')->>'nameUr',
              (select name_ur from public.master_records where id::text=heads->0->>'categoryId'),'') else '' end),
          'historical',historical) order by ${order}) from located),'[]'::jsonb)),
        'meta',jsonb_build_object('total',p.total,'page',p.page,'pageSize',20)) as payload
      from summary s cross join paging p
    `);
    return donationPageSchema.parse(result?.payload);
  });
}

export async function donationOptions() {
  return withBooksDatabase(async(tx,actor)=>{
    roleCheck(actor.role);
    const [result] = await tx.execute<{data:unknown}>(sql`
      select jsonb_build_object(
        'editions',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'nameEn',m.name_en,'nameUr',m.name_ur,
          'bookType',m.edition_book_type,'tokenValuePaise',m.edition_token_value_paise)
          order by m.edition_book_type,m.edition_number,m.edition_token_value_paise,m.id)
          from public.master_records m where m.kind='EDITION' and m.deleted_at is null
            and exists(select 1 from public.books b where b.edition_id=m.id and b.deleted_at is null)),'[]'::jsonb),
        'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nameEn',c.name_en,'nameUr',c.name_ur,
          'heads',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'nameEn',h.name_en,'nameUr',h.name_ur)
            order by h.sort_order,h.name_en,h.id) from public.master_records h
            where h.kind='DONATION_HEAD' and h.parent_id=c.id and h.deleted_at is null),'[]'::jsonb))
          order by c.sort_order,c.name_en,c.id) from public.master_records c
          where c.kind='DONATION_CATEGORY' and c.deleted_at is null),'[]'::jsonb)
      ) as data
    `);
    return donationOptionsSchema.parse({data:result?.data}).data;
  });
}

export async function readDonation(id:string) {
  return withBooksDatabase(async(tx,actor)=>{
    roleCheck(actor.role);
    const [result] = await tx.execute<{data:unknown}>(sql`
      select jsonb_build_object(
        'number',receipt.receipt_number,'returnId',receipt.return_id,'anonymous',coalesce(receipt.data->>'anonymous'='true',false),
        'donorName',case when receipt.data->>'anonymous'='true' then '' else coalesce(receipt.data->>'donorName','') end,
        'phone',case when receipt.data->>'anonymous'='true' then '' else coalesce(nullif(receipt.phone,''),receipt.data->>'phone','') end,
        'address',concat_ws(', ',nullif(receipt.data->>'village',''),
          case when receipt.data->>'anonymous' is distinct from 'true' then nullif(receipt.data->>'postOffice','') end,
          case when receipt.data->>'anonymous' is distinct from 'true' then nullif(receipt.data->>'block','') end,
          coalesce(nullif(receipt.data->>'district',''),location.value->>'district'),
          coalesce(nullif(receipt.data->>'state',''),location.value->>'state'),
          case when receipt.data->>'anonymous' is distinct from 'true' then nullif(receipt.data->>'pin','') end),
        'amountPaise',receipt.amount_paise,'amountWords',coalesce(receipt.data->>'amountWords',''),'status',receipt.status,
        'reason',jsonb_build_object('nameEn',coalesce(receipt.labels->(receipt.data->>'reasonId')->>'nameEn',reason.name_en,''),
          'nameUr',coalesce(receipt.labels->(receipt.data->>'reasonId')->>'nameUr',reason.name_ur,'')),
        'payment',coalesce(nullif(receipt.data->>'paymentMode',''),'CASH'),'reference',coalesce(receipt.data->>'reference',''),
        'transactionDate',coalesce(receipt.data->>'transactionDate',''),'chequeNumber',coalesce(receipt.data->>'chequeNumber',''),
        'chequeDate',coalesce(receipt.data->>'chequeDate',''),'branch',coalesce(receipt.data->>'branch',''),
        'bank',jsonb_build_object('nameEn',coalesce(receipt.labels->(receipt.data->>'bankId')->>'nameEn',bank.name_en,''),
          'nameUr',coalesce(receipt.labels->(receipt.data->>'bankId')->>'nameUr',bank.name_ur,'')),
        'upiApp',jsonb_build_object('nameEn',coalesce(receipt.labels->(receipt.data->>'upiAppId')->>'nameEn',app.name_en,''),
          'nameUr',coalesce(receipt.labels->(receipt.data->>'upiAppId')->>'nameUr',app.name_ur,'')),
        'entryBy',receipt.entry_by_name,'remarks',coalesce(receipt.data->>'remarks',''),
        'checked',receipt.checked,'finalized',returned.finalized_at is not null,
        'openIssues',(select count(*)::integer from public.receipt_issues issue where issue.return_id=receipt.return_id
          and issue.receipt_number=receipt.receipt_number and issue.status='OPEN'),
        'pendingEdits',(select count(*)::integer from public.receipt_edit_requests request where request.receipt_id=receipt.id and request.status='PENDING'),
        'heads',coalesce((select jsonb_agg(jsonb_build_object(
          'nameEn',coalesce(receipt.labels->(item->>'headId')->>'nameEn',head.name_en,''),
          'nameUr',coalesce(receipt.labels->(item->>'headId')->>'nameUr',head.name_ur,''),
          'category',jsonb_build_object('nameEn',coalesce(receipt.labels->(item->>'categoryId')->>'nameEn',category.name_en,''),
            'nameUr',coalesce(receipt.labels->(item->>'categoryId')->>'nameUr',category.name_ur,'')),
          'purpose',coalesce(item->>'purpose',''),'amountPaise',nullif(item->>'amountPaise','')::bigint) order by ordinal)
          from jsonb_array_elements(${headsArray}) with ordinality h(item,ordinal)
          left join public.master_records head on head.id::text=item->>'headId' and head.kind='DONATION_HEAD'
          left join public.master_records category on category.id::text=item->>'categoryId' and category.kind='DONATION_CATEGORY'),'[]'::jsonb)
      ) as data
      from public.book_receipts receipt
      join public.book_returns returned on returned.id=receipt.return_id and returned.book_id=receipt.book_id and returned.deleted_at is null
      join public.books book on book.id=receipt.book_id and book.deleted_at is null
      join public.book_assignments assigned on assigned.id=returned.assignment_id and assigned.deleted_at is null
      left join lateral (select case when receipt.version=1 and receipt.data->>'remarks' like 'HISTORICAL SUMMARY%'
        and coalesce(btrim(receipt.data->>'district'),'')='' and coalesce(btrim(receipt.data->>'village'),'')=''
        then public.receipt_historical_location(receipt.id) else '{}'::jsonb end as value) location on true
      left join public.master_records reason on reason.id::text=receipt.data->>'reasonId' and reason.kind='RECEIPT_REASON'
      left join public.master_records bank on bank.id::text=receipt.data->>'bankId' and bank.kind='BANK'
      left join public.master_records app on app.id::text=receipt.data->>'upiAppId' and app.kind='UPI_APP'
      where receipt.id=${id}::uuid and receipt.deleted_at is null
    `);
    if(!result?.data)throw new AuthFailure("DONATION_NOT_FOUND",404);
    return donationDetailSchema.parse({data:result.data}).data;
  });
}
