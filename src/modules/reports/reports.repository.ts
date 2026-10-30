import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { reportOptionsSchema, reportPageSchema } from "@/modules/reports/reports.schema";
import type { ReportQuery } from "@/modules/reports/reports.schema";
const like=(s:string)=>`%${s.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_")}%`;
export async function reportOptions(){
 return withBooksDatabase(async(tx,actor)=>{
  if(actor.role!=="ADMIN"&&actor.role!=="SUPER_ADMIN")throw new AuthFailure("ACCESS_DENIED");
  const [result]=await tx.execute<{data:unknown}>(sql`
   select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name_en,'bookType',m.edition_book_type,
    'tokenValuePaise',m.edition_token_value_paise) order by m.edition_book_type,m.edition_number,m.edition_token_value_paise,m.id),'[]'::jsonb) as data
   from public.master_records m where m.kind='EDITION' and m.deleted_at is null
    and exists(select 1 from public.books b where b.edition_id=m.id and b.deleted_at is null)`);
  return reportOptionsSchema.parse({data:result?.data}).data;
 });
}
export async function readReports(q:ReportQuery){
 return withBooksDatabase(async(tx,actor)=>{
  if(actor.role!=="ADMIN"&&actor.role!=="SUPER_ADMIN")throw new AuthFailure("ACCESS_DENIED");
  const conditions=[sql`true`];
  if(q.bookType!=="ALL")conditions.push(sql`book_type=${q.bookType}`);
  if(q.editionId)conditions.push(sql`edition_id=${q.editionId}::uuid`);
  if(q.from)conditions.push(sql`donation_date>=${q.from}::date`);
  if(q.to)conditions.push(sql`donation_date<=${q.to}::date`);
  if(q.stage==="DRAFT")conditions.push(sql`finalized_at is null`);
  else if(q.stage==="FINALIZED")conditions.push(sql`finalized_at is not null`);
  else if(q.stage!=="ALL")conditions.push(sql`receipt_entry_status=${q.stage}`);
  const dimensions={
   EDITIONS:sql`edition_id::text as group_id,edition_name as name,concat(book_type,case when token_value_paise is not null then ' · ₹'||(token_value_paise/100)::text else '' end) as detail`,
   BOOKS:sql`book_id::text as group_id,book_number as name,edition_name||' · '||book_type as detail`,
   FUNDRAISERS:sql`collector_id::text as group_id,collector_name as name,collector_code as detail`,
   HEADS:sql`coalesce(head_id,'UNSPECIFIED') as group_id,coalesce(head_name,'Unspecified / multiple heads') as name,coalesce(category_name,'Historical or unallocated donation') as detail`,
   AREAS:sql`lower(area_name) as group_id,area_name as name,''::text as detail`,
   PAYMENTS:sql`payment as group_id,payment as name,''::text as detail`,
  };
  const sorting=q.sort==="NAME"?sql`lower(name),group_id`:sql`collected desc,lower(name),group_id`;
  const [result]=await tx.execute<{payload:unknown}>(sql`
   with live_returns as materialized (
    select r.id as return_id,r.book_id,r.assignment_id,r.finalized_at,r.return_date,r.receipt_entry_status,r.commission_basis_points,
     (to_jsonb(r)->>'historical_commission_paise')::bigint as historical_commission,
     b.edition_id,b.edition_name_en as edition_name,b.book_number,b.book_type,b.token_value_paise,
     a.collector_id,a.collector_name,a.collector_code,a.areas
    from public.book_returns r join public.books b on b.id=r.book_id and b.deleted_at is null
    join public.book_assignments a on a.id=r.assignment_id and a.deleted_at is null where r.deleted_at is null
   ), receipts as materialized (
    select receipt.id,receipt.amount_paise,receipt.checked,receipt.data,
     coalesce(nullif(receipt.data->>'date',''),r.return_date::text)::date as donation_date,
     coalesce(nullif(receipt.data->>'paymentMode',''),'CASH') as payment,
     case when jsonb_typeof(receipt.data->'heads')='array' and jsonb_array_length(receipt.data->'heads')=1
      then nullif(receipt.data->'heads'->0->>'headId','') end as head_id,
     r.*
    from public.book_receipts receipt join live_returns r on r.return_id=receipt.return_id and r.book_id=receipt.book_id
    where receipt.deleted_at is null and receipt.status='VALID' and receipt.amount_paise>0
   ), return_totals as (
    select return_id,sum(amount_paise) as collected,
     coalesce(max(historical_commission),round(sum(amount_paise)::numeric*max(commission_basis_points)/1000000)*100) as commission
    from receipts group by return_id
   ), apportioned as (
    select receipt.*,floor(t.commission*receipt.amount_paise/t.collected) as base_commission,t.commission as book_commission,
     mod(t.commission*receipt.amount_paise,t.collected) as remainder
    from receipts receipt join return_totals t on t.return_id=receipt.return_id
   ), allocations as (
    select a.*,base_commission+case when row_number() over(partition by return_id order by remainder desc,id)
      <=book_commission-sum(base_commission) over(partition by return_id) then 1 else 0 end as allocated_commission
    from apportioned a
   ), scoped as materialized (
    select * from allocations where ${sql.join(conditions,sql` and `)}
   ), enriched as (
    select s.*,head.name_en as head_name,category.name_en as category_name,
     case when ${q.view === "AREAS"} then coalesce(nullif(btrim(s.data->>'district'),''),nullif(btrim(s.data->>'village'),''),
      case when left(coalesce(s.data->>'remarks',''),18)='HISTORICAL SUMMARY'
       and coalesce(s.data->>'district','')='' and coalesce(s.data->>'state','')=''
       then public.receipt_historical_location(s.id)->>'district' end,
      nullif(btrim(s.data->>'state'),''),
      case when jsonb_typeof(s.areas)='array' and jsonb_array_length(s.areas)=1 then nullif(s.areas->0->>'nameEn','') end,
      'Not recorded') else '' end as area_name
    from scoped s left join public.master_records head on head.id::text=s.head_id and head.kind='DONATION_HEAD'
    left join public.master_records category on category.id=head.parent_id
   ), dimensioned as (
    select enriched.*,${dimensions[q.view]} from enriched
   ), matching as materialized (
    select * from dimensioned where ${q.search?sql`concat_ws(' ',name,detail) ilike ${like(q.search)}`:sql`true`}
   ), grouped as (
    select group_id,min(name) as name,min(detail) as detail,count(*)::integer as receipts,count(distinct book_id)::integer as books,
     sum(amount_paise) as collected,sum(allocated_commission) as commission,
     coalesce(sum(amount_paise) filter(where payment='CASH'),0) as cash,
     coalesce(sum(amount_paise) filter(where payment='DIGITAL'),0) as digital,
     coalesce(sum(amount_paise) filter(where payment='CHEQUE'),0) as cheque
    from matching group by group_id
   ), totals as (
    select coalesce(sum(amount_paise),0) as collected,coalesce(sum(allocated_commission),0) as commission,
     coalesce(sum(amount_paise) filter(where finalized_at is null),0) as draft,
     coalesce(sum(amount_paise) filter(where finalized_at is not null),0) as finalized,
     coalesce(sum(amount_paise) filter(where payment='CASH'),0) as cash,
     coalesce(sum(amount_paise) filter(where payment='DIGITAL'),0) as digital,
     coalesce(sum(amount_paise) filter(where payment='CHEQUE'),0) as cheque,
     count(*)::integer as receipts,count(distinct book_id)::integer as books,count(*) filter(where checked)::integer as checked
    from matching
   ), paging as (
    select count(*)::integer as total,least(${q.page},greatest(1,ceil(count(*)/20.0)::integer)) as page from grouped
   ), page_rows as (
    select * from grouped order by ${sorting} limit 20 offset(select(page-1)*20 from paging)
   )
   select jsonb_build_object('data',jsonb_build_object('totals',jsonb_build_object(
    'collectedPaise',t.collected,'commissionPaise',t.commission,'netPaise',t.collected-t.commission,'draftPaise',t.draft,'finalizedPaise',t.finalized,
    'cashPaise',t.cash,'digitalPaise',t.digital,'chequePaise',t.cheque,'receipts',t.receipts,'books',t.books,'checked',t.checked),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',group_id,'name',name,'detail',detail,'receipts',receipts,'books',books,
     'collectedPaise',collected,'commissionPaise',commission,'netPaise',collected-commission,'cashPaise',cash,'digitalPaise',digital,'chequePaise',cheque)
     order by ${sorting}) from page_rows),'[]'::jsonb)),
    'meta',jsonb_build_object('total',p.total,'page',p.page,'pageSize',20)) as payload from totals t cross join paging p
  `);
  return reportPageSchema.parse(result?.payload);
 });
}
