import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { notificationResponseSchema,searchResponseSchema } from "@/modules/navigation/navigation.schema";
const pattern=(q:string)=>q.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_");
function checkRole(role:string){if(role!=="ADMIN"&&role!=="SUPER_ADMIN")throw new AuthFailure("ACCESS_DENIED");}
const bookLabel=sql`concat(case when b.edition_number is not null then 'ED-'||lpad(b.edition_number::text,2,'0')||'-' else '' end,
 case when b.book_type='TOKEN' and b.token_value_paise is not null then 'T-'||(b.token_value_paise/100)::text||'-' else '' end,
 case when b.edition_book_number is not null then 'Book'||b.edition_book_number::text||'/'||b.receipt_from::text else b.book_number end)`;
// Read the same workflow records used by Approvals/Flags; no duplicate notification data.
function workItems(actor:{id:string;role:string},includeClosed=false) {
 const superAdmin=actor.role==="SUPER_ADMIN";
 return sql`
 select q.id,'RECEIPT_EDIT'::text as kind,a.collector_name||' · #'||q.receipt_number as title,
  b.book_number||' · '||q.status as detail,case when q.status='APPROVED' then '/receipt-entry/'||r.id::text else '/approvals' end as href,
  case when q.status='APPROVED' then jsonb_build_object('returnId',r.id,'number',q.receipt_number)
   else jsonb_build_object('reviewKind','RECEIPT_EDIT','reviewStatus',q.status,'search',q.receipt_number::text) end as target,
  q.created_at as event_at,case when q.status='APPROVED' then 0 else 1 end as priority
 from public.receipt_edit_requests q
 join public.book_returns r on r.id=q.return_id and r.deleted_at is null
 join public.books b on b.id=r.book_id and b.deleted_at is null
 join public.book_assignments a on a.id=r.assignment_id and a.deleted_at is null
 where ${superAdmin?(includeClosed?sql`true`:sql`q.status='PENDING'`):sql`q.requested_by=${actor.id}::uuid and ${includeClosed?sql`true`:sql`q.status in ('PENDING','APPROVED')`}`}
 union all
 select q.id,'PROFILE_EDIT',p.full_name,f.code||' · '||q.status,'/approvals',
  jsonb_build_object('reviewKind','PROFILE_EDIT','reviewStatus',q.status,'search',f.code),q.created_at,1
 from public.collector_edit_requests q join public.people p on p.id=q.collector_id and p.deleted_at is null
 join public.fundraisers f on f.person_id=p.id and f.deleted_at is null
 where q.deleted_at is null and ${includeClosed?sql`true`:sql`q.status='PENDING'`} and ${superAdmin?sql`true`:sql`q.requested_by=${actor.id}::uuid`}
 union all
 select q.id,'RECEIPT_ISSUE',a.collector_name||' · #'||q.receipt_number,b.book_number,'/flags',
  jsonb_build_object('reviewKind','RECEIPT_ISSUE','reviewStatus',q.status,'search',q.receipt_number::text),q.created_at,0
 from public.receipt_issues q join public.book_returns r on r.id=q.return_id and r.deleted_at is null
 join public.books b on b.id=r.book_id and b.deleted_at is null
 join public.book_assignments a on a.id=r.assignment_id and a.deleted_at is null
 where ${includeClosed?sql`true`:sql`q.status='OPEN'`} and ${superAdmin?sql`true`:sql`q.raised_by=${actor.id}::uuid`}
 union all
 select q.id,'BOOK_FLAG',a.collector_name,b.book_number||' · '||q.reason_en,'/flags',
  jsonb_build_object('reviewKind','BOOK_FLAG','reviewStatus',q.status,'search',b.book_number),q.created_at,0
 from public.book_flags q join public.book_returns r on r.id=q.return_id and r.deleted_at is null
 join public.books b on b.id=r.book_id and b.deleted_at is null
 join public.book_assignments a on a.id=r.assignment_id and a.deleted_at is null
 where q.deleted_at is null and ${includeClosed?sql`true`:sql`q.status<>'RESOLVED'`} and ${superAdmin?sql`true`:sql`q.created_by=${actor.id}::uuid`}
 union all
 select c.id,'OVERDUE',a.collector_name,b.book_number||' · '||a.expected_return_date::text,'/books/returns',
  jsonb_build_object('search',b.book_number),a.expected_return_date::timestamp at time zone 'Asia/Kolkata',2
 from public.book_cases c join public.books b on b.id=c.book_id and b.deleted_at is null
 join public.book_assignments a on a.id=c.assignment_id and a.deleted_at is null
 where c.closed_at is null and a.expected_return_date<(now() at time zone 'Asia/Kolkata')::date
  and not exists(select 1 from public.book_returns r where r.case_id=c.id and r.deleted_at is null)
  and ${superAdmin?sql`true`:sql`a.created_by=${actor.id}::uuid`}
 `;
}
export async function readNotifications() {
 return withBooksDatabase(async(tx,actor)=>{
  checkRole(actor.role);
  const [result]=await tx.execute<{data:unknown}>(sql`
   with work as materialized (${workItems(actor)}), recent as (
    select * from work order by priority,event_at desc,id limit 12
   ) select jsonb_build_object('total',(select count(*)::integer from work),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'detail',detail,'href',href,'target',target)
     order by priority,event_at desc,id) from recent),'[]'::jsonb)) as data
  `);
  return notificationResponseSchema.parse({data:result?.data}).data;
 });
}
export async function searchNavigation(term:string) {
 return withBooksDatabase(async(tx,actor)=>{
  checkRole(actor.role);
  const match=`%${pattern(term)}%`;const prefix=`${pattern(term)}%`;const admin=actor.role==="SUPER_ADMIN";
  const sources=[
   sql`(select p.id,'FUNDRAISER'::text as kind,p.full_name as title,f.code||coalesce(' · '||nullif(f.village,''),'') as detail,
    '/people'::text as href,jsonb_build_object('search',f.code) as target,0 as priority
    from public.people p join public.fundraisers f on f.person_id=p.id and f.deleted_at is null
    where p.deleted_at is null and p.role='COLLECTOR' and concat_ws(' ',p.full_name,p.phone,f.code,f.village) ilike ${match}
    order by case when p.full_name ilike ${prefix} then 0 else 1 end,p.full_name,p.id limit 3)`,
   sql`(select b.id,'BOOK',${bookLabel},b.edition_name_en||' · '||b.status,'/books',
    jsonb_build_object('search',b.book_number,'editionId',b.edition_id,'bookType',b.book_type),1
    from public.books b where b.deleted_at is null and concat_ws(' ',b.book_number,${bookLabel},b.edition_name_en,b.edition_name_ur,
     b.edition_book_number::text,b.receipt_from::text,b.receipt_to::text) ilike ${match}
    order by b.edition_number,b.edition_book_number,b.receipt_from,b.id limit 3)`,
   sql`(select a.id,'ASSIGNMENT',a.number,a.collector_name||' · '||a.assignment_date::text,'/books/assignments',
    jsonb_build_object('search',a.number),2
    from public.book_assignments a where a.deleted_at is null and concat_ws(' ',a.number,a.collector_name,a.collector_code) ilike ${match}
    order by a.assignment_date desc,a.id limit 2)`,
   sql`(select r.id,'SUBMISSION',r.number,a.collector_name||' · '||b.book_number,'/receipt-entry/'||r.id::text,'{}'::jsonb,2
    from public.book_returns r join public.books b on b.id=r.book_id and b.deleted_at is null
    join public.book_assignments a on a.id=r.assignment_id and a.deleted_at is null
    where r.deleted_at is null and concat_ws(' ',r.number,b.book_number,a.collector_name,a.collector_code) ilike ${match}
    order by r.created_at desc,r.id limit 2)`,
   sql`(select receipt.id,'RECEIPT','#'||receipt.receipt_number||' · '||case when receipt.data->>'anonymous'='true' then 'Anonymous'
      else coalesce(nullif(receipt.data->>'donorName',''),'Not recorded') end,
    b.book_number||' · '||a.collector_name,'/receipt-entry/'||r.id::text,
    jsonb_build_object('returnId',r.id,'number',receipt.receipt_number),1
    from public.book_receipts receipt join public.book_returns r on r.id=receipt.return_id and r.book_id=receipt.book_id and r.deleted_at is null
    join public.books b on b.id=receipt.book_id and b.deleted_at is null
    join public.book_assignments a on a.id=r.assignment_id and a.deleted_at is null
    where receipt.deleted_at is null and concat_ws(' ',receipt.receipt_number::text,b.book_number,
      case when receipt.data->>'anonymous' is distinct from 'true' then receipt.data->>'donorName' end,
      case when receipt.data->>'anonymous' is distinct from 'true' then receipt.phone end) ilike ${match}
    order by receipt.updated_at desc,receipt.id limit 3)`,
   sql`(select id,kind,title,detail,href,target,priority from (${workItems(actor,true)}) work
    where concat_ws(' ',title,detail) ilike ${match} order by priority,event_at desc,id limit 2)`,
  ];
  if(admin)sources.push(
   sql`(select l.id,'LEFTOVER',l.code,b.book_number||' · '||l.status,'/books/leftovers',jsonb_build_object('search',l.code),2
    from public.leftover_books l join public.books b on b.id=l.book_id and b.deleted_at is null
    where l.deleted_at is null and concat_ws(' ',l.code,b.book_number,b.edition_name_en) ilike ${match}
    order by l.created_at desc,l.id limit 2)`,
   sql`(select p.id,'USER',p.full_name,coalesce(p.email,'')||' · '||p.role,'/users',
    jsonb_build_object('search',left(coalesce(nullif(p.email,''),p.full_name),100)),3 from public.people p
    where p.deleted_at is null and p.role in ('SUPER_ADMIN','ADMIN') and concat_ws(' ',p.full_name,p.email,p.phone) ilike ${match}
    order by p.full_name,p.id limit 2)`,
   sql`(select m.id,'EDITION',m.name_en,m.code||case when m.edition_book_type='TOKEN' then ' · ₹'||(m.edition_token_value_paise/100)::text else '' end,
    '/books/editions/'||m.id::text||'/summary','{}'::jsonb,2 from public.master_records m
    where m.kind='EDITION' and m.deleted_at is null and concat_ws(' ',m.name_en,m.name_ur,m.code,m.edition_code) ilike ${match}
    order by m.edition_number,m.id limit 2)`,
   sql`(select m.id,'MASTER',m.name_en,m.code||' · '||m.kind,'/masters',
    jsonb_build_object('search',left(m.name_en,100),'masterKind',case when m.kind='DONATION_CATEGORY' then 'DONATION_HEAD' else m.kind end),4
    from public.master_records m where m.kind<>'EDITION' and m.deleted_at is null
     and concat_ws(' ',m.name_en,m.name_ur,m.code) ilike ${match}
    order by m.sort_order,m.id limit 2)`
  );
  const [result]=await tx.execute<{data:unknown}>(sql`
   with matches as (${sql.join(sources,sql` union all `)}), ranked as (
    select *,case when lower(title)=lower(${term}) then 0 when title ilike ${prefix} then 1 else 2 end as relevance
    from matches
   ), selected as (select * from ranked order by relevance,priority,lower(title),id limit 12)
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'detail',detail,'href',href,'target',target)
    order by relevance,priority,lower(title),id),'[]'::jsonb) as data from selected
  `);
  return searchResponseSchema.parse({data:result?.data}).data;
 });
}
