import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { reviewCollectorRequest } from "@/modules/people/people.repository";
import { reviewPageSchema, reviewDetailSchema } from "@/modules/reviews/reviews.schema";
import type { ReviewAction, ReviewKind, ReviewQuery } from "@/modules/reviews/reviews.schema";

const pattern = (value: string) => `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
function requireReviewReader(role: string) {
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") throw new AuthFailure("ACCESS_DENIED");
}
function entries(kind: ReviewKind) {
  if (kind === "PROFILE_EDIT") return sql`
    select q.id, q.status, p.full_name as subject, f.code as reference, coalesce(actor.full_name,'') as actor,
      q.reason, q.review_note as note, q.created_at, q.reviewed_at, null::uuid as return_id, p.id as person_id,
      null::integer as receipt_number, null::bigint as expected, null::bigint as found,
      q.status = 'PENDING' as reviewable, q.status = 'PENDING' and p.updated_at = q.version::timestamptz as approvable,
      case when q.status = 'PENDING' and p.updated_at <> q.version::timestamptz then 'STALE' end as blocked
    from public.collector_edit_requests q join public.people p on p.id = q.collector_id and p.deleted_at is null
    join public.fundraisers f on f.person_id = p.id and f.deleted_at is null
    left join public.people actor on actor.id = q.requested_by where q.deleted_at is null`;
  if (kind === "RECEIPT_EDIT") return sql`
    select q.id, q.status, a.collector_name as subject, b.book_number as reference, q.requested_by_name as actor,
      q.reason, q.review_note as note, q.created_at, q.reviewed_at, r.id as return_id, null::uuid as person_id,
      q.receipt_number, null::bigint as expected, null::bigint as found, q.status = 'PENDING' as reviewable,
      q.status = 'PENDING' and receipt.version = q.base_version and receipt.deleted_at is null as approvable,
      case when q.status = 'PENDING' and (receipt.version <> q.base_version or receipt.deleted_at is not null) then 'STALE' end as blocked
    from public.receipt_edit_requests q join public.book_returns r on r.id = q.return_id and r.deleted_at is null
    join public.books b on b.id = r.book_id and b.deleted_at is null
    join public.book_assignments a on a.id = r.assignment_id and a.deleted_at is null
    join public.book_receipts receipt on receipt.id = q.receipt_id`;
  if (kind === "RECEIPT_ISSUE") return sql`
    select q.id, q.status, a.collector_name as subject, b.book_number as reference, q.raised_by_name as actor,
      q.reason, q.resolution as note, q.created_at, q.resolved_at as reviewed_at, r.id as return_id, null::uuid as person_id,
      q.receipt_number, null::bigint as expected, null::bigint as found, q.status = 'OPEN' as reviewable,
      false as approvable, null::text as blocked
    from public.receipt_issues q join public.book_returns r on r.id = q.return_id and r.deleted_at is null
    join public.books b on b.id = r.book_id and b.deleted_at is null
    join public.book_assignments a on a.id = r.assignment_id and a.deleted_at is null`;
  return sql`
    select q.id, q.status, a.collector_name as subject, b.book_number as reference, q.created_by_name as actor,
      concat_ws(' · ', q.reason_en, nullif(q.remarks,'')) as reason, ''::text as note, q.created_at,
      case when q.status = 'RESOLVED' then q.updated_at end as reviewed_at,
      r.id as return_id, null::uuid as person_id, null::integer as receipt_number,
      q.expected_paise as expected, q.found_paise as found,
      q.status <> 'RESOLVED' and r.finalized_at is not null and not r.submission_pending
        and not exists(select 1 from public.receipt_issues issue where issue.return_id = r.id and issue.status = 'OPEN') as reviewable,
      false as approvable, case when q.status <> 'RESOLVED' then
        case when r.finalized_at is null or r.submission_pending then 'FINALIZE_FIRST'
          when exists(select 1 from public.receipt_issues issue where issue.return_id = r.id and issue.status = 'OPEN') then 'OPEN_ISSUES' end end as blocked
    from (select flag.*, coalesce(actor.full_name,'') as created_by_name from public.book_flags flag
      left join public.people actor on actor.id = flag.created_by where flag.deleted_at is null) q
    join public.book_returns r on r.id = q.return_id and r.deleted_at is null
    join public.books b on b.id = r.book_id and b.deleted_at is null
    join public.book_assignments a on a.id = r.assignment_id and a.deleted_at is null`;
}
export async function listReviews(query: ReviewQuery) {
  return withBooksDatabase(async (tx, actor) => {
    requireReviewReader(actor.role);
    const conditions = [sql`true`];
    if (query.search) conditions.push(sql`concat_ws(' ', subject, reference, actor, reason, receipt_number::text) ilike ${pattern(query.search)}`);
    if (query.from) conditions.push(sql`created_at >= (${query.from}::date::timestamp at time zone 'Asia/Kolkata')`);
    if (query.to) conditions.push(sql`created_at < ((${query.to}::date + 1)::timestamp at time zone 'Asia/Kolkata')`);
    const filter = query.status === "ALL" ? sql`true` : query.status === "ACTIVE" ? sql`status in ('PENDING','OPEN','UNDER_REVIEW')` : sql`status = ${query.status}`;
    const [result] = await tx.execute<{ payload: unknown }>(sql`
      with entries as (${entries(query.kind)}), matching as materialized (select * from entries where ${sql.join(conditions, sql` and `)}),
      summary as (select count(*)::integer as total, count(*) filter(where status in ('PENDING','OPEN','UNDER_REVIEW'))::integer as active from matching),
      filtered as (select * from matching where ${filter}),
      paging as (select count(*)::integer as total, least(${query.page}, greatest(1,ceil(count(*)/20.0)::integer)) as page from filtered),
      rows as (select * from filtered order by created_at desc,id desc limit 20 offset (select (page-1)*20 from paging))
      select jsonb_build_object('data',jsonb_build_object(
        'summary',jsonb_build_object('total',s.total,'active',s.active,'completed',s.total-s.active),
        'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',${query.kind}::text,'status',status,'subject',subject,'reference',reference,
          'actor',actor,'reason',left(reason,180),'note',left(note,180),'createdAt',created_at,'reviewedAt',reviewed_at,
          'returnId',return_id,'personId',person_id,'receiptNumber',receipt_number,'expectedPaise',expected,'foundPaise',found,
          'canReview',${actor.role === "SUPER_ADMIN"} and reviewable,'canApprove',${actor.role === "SUPER_ADMIN"} and approvable,'blocked',blocked)
          order by created_at desc,id desc) from rows),'[]'::jsonb)),
        'meta',jsonb_build_object('total',p.total,'page',p.page,'pageSize',20)) as payload from summary s cross join paging p`);
    return reviewPageSchema.parse(result?.payload);
  });
}
export async function readReview(id: string, kind: ReviewKind) {
  return withBooksDatabase(async (tx, actor) => {
    requireReviewReader(actor.role);
    const [result] = kind === "PROFILE_EDIT" ? await tx.execute<{ payload: unknown }>(sql`
      select jsonb_build_object('data',jsonb_build_object('reason',q.reason,'note',q.review_note,
        'changes',coalesce((select jsonb_agg(jsonb_build_object('field',entry.key,'before',coalesce(q.old_values->>entry.key,''),'after',coalesce(q.new_values->>entry.key,'')) order by entry.key)
          from jsonb_each(q.new_values) entry where q.old_values->entry.key is distinct from entry.value),'[]'::jsonb),
        'photoChanged',q.photo_changed,'currentHasPhoto',p.profile_photo_key is not null,
        'proposedHasPhoto',q.photo_changed and q.proposed_photo_key is not null and q.status <> 'REJECTED','receipt',null)) as payload
      from public.collector_edit_requests q join public.people p on p.id=q.collector_id and p.deleted_at is null
      where q.id=${id}::uuid and q.deleted_at is null`) : await tx.execute<{ payload: unknown }>(sql`
      with entry as (${entries(kind)}) select jsonb_build_object('data',jsonb_build_object('reason',entry.reason,'note',entry.note,
        'changes','[]'::jsonb,'photoChanged',false,'currentHasPhoto',false,'proposedHasPhoto',false,
        'receipt',(select jsonb_build_object('name',case when receipt.data->>'anonymous'='true' then '' else coalesce(receipt.data->>'donorName','') end,
          'anonymous',coalesce(receipt.data->>'anonymous'='true',false),'amountPaise',receipt.amount_paise,
          'payment',coalesce(receipt.data->>'paymentMode',''),'date',coalesce(receipt.data->>'date',''),'checked',receipt.checked)
          from public.book_receipts receipt where receipt.return_id=entry.return_id and receipt.receipt_number=entry.receipt_number and receipt.deleted_at is null limit 1))) as payload
      from entry where entry.id=${id}::uuid`);
    if (!result) throw new AuthFailure("REVIEW_NOT_FOUND",404);
    return reviewDetailSchema.parse(result.payload);
  });
}
export async function reviewAction(input: ReviewAction) {
  if (input.kind === "PROFILE_EDIT") {
    if (input.decision === "RESOLVED") throw new AuthFailure("INVALID_INPUT",400);
    await reviewCollectorRequest(input.id,input.decision,input.note);
  } else await withBooksDatabase(async (tx,actor) => {
    if (actor.role !== "SUPER_ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const operation = input.kind === "RECEIPT_EDIT" ? "REVIEW_EDIT" : input.kind === "RECEIPT_ISSUE" ? "RESOLVE_ISSUE" : "RESOLVE_BOOK_FLAG";
    await tx.execute(sql`select public.review_receipt_workflow(${input.id}::uuid,${operation},${input.decision},${input.note})`);
  });
  return { id:input.id,kind:input.kind,status:input.decision };
}
