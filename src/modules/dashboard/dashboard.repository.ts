import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { dashboardSchema } from "@/modules/dashboard/dashboard.schema";
import type { DashboardQuery } from "@/modules/dashboard/dashboard.schema";

export async function readDashboard(query: DashboardQuery, onTiming?: (name: string, milliseconds: number) => void) {
  const startedAt = performance.now();
  return withBooksDatabase(async (tx, actor) => {
    onTiming?.("dashboard_auth_context", performance.now() - startedAt);
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const unit = query.interval === "yearly" ? "year" : query.interval === "weekly" ? "week" : "month";
    const step = `1 ${unit}`;
    const lookback = `${query.interval === "yearly" ? 23 : 11} ${unit}s`;
    const queryStartedAt = performance.now();
    const [result] = await tx.execute<{ data: unknown }>(sql`
      with access as (
        select ${actor.role === "SUPER_ADMIN"} or not exists (
          select 1 from public.user_permissions where person_id = ${actor.id}::uuid
            and permission = 'dashboard.read' and not allowed and deleted_at is null
        ) as allowed
      ), live_books as materialized (
        select id, status, book_type from public.books where deleted_at is null
      ), live_returns as materialized (
        select r.id, r.book_id, r.case_id, r.assignment_id, r.finalized_at, r.return_date,
          r.commission_basis_points, r.commission_given,
          (to_jsonb(r)->>'historical_commission_paise')::bigint as historical_commission
        from public.book_returns r join live_books b on b.id = r.book_id
        join public.book_assignments a on a.id = r.assignment_id and a.deleted_at is null
        where r.deleted_at is null
      ), receipt_source as materialized (
        select receipt.id, receipt.return_id, receipt.book_id, receipt.status, receipt.amount_paise,
          receipt.checked, receipt.updated_at,
          coalesce(nullif(receipt.data->>'date', ''), returned.return_date::text)::date as donation_date,
          coalesce(receipt.data->>'paymentMode', 'CASH') as payment,
          coalesce(receipt.data->>'anonymous' = 'true', false) as anonymous,
          case when receipt.data->>'anonymous' = 'true' then '' else
            regexp_replace(btrim(coalesce(receipt.data->>'donorName', '')), '[[:space:]]+', ' ', 'g') end as name,
          regexp_replace(coalesce(nullif(receipt.phone, ''), receipt.data->>'phone', ''), '[^0-9]', '', 'g') as phone,
          book.book_type
        from public.book_receipts receipt join live_returns returned on returned.id = receipt.return_id and returned.book_id = receipt.book_id
        join live_books book on book.id = receipt.book_id where receipt.deleted_at is null
      ), valid_receipts as materialized (
        select * from receipt_source where status = 'VALID' and amount_paise > 0
      ), clock as (select (now() at time zone 'Asia/Kolkata')::date as today), bounds as (
        select today,
          case ${query.period}
            when 'thisMonth' then date_trunc('month', today)::date
            when 'lastMonth' then (date_trunc('month', today) - interval '1 month')::date
            when 'thisYear' then date_trunc('year', today)::date
            else coalesce((select min(donation_date) from valid_receipts where donation_date <= today), date_trunc('month', today)::date) end as starts,
          case when ${query.period} = 'lastMonth' then (date_trunc('month', today) - interval '1 day')::date else today end as ends
        from clock
      ), scoped as materialized (
        select r.* from valid_receipts r cross join bounds where r.donation_date between bounds.starts and bounds.ends
      ), return_amounts as (
        select r.id, r.commission_given, sum(receipt.amount_paise) as all_collected,
          coalesce(max(r.historical_commission), round(sum(receipt.amount_paise)::numeric * r.commission_basis_points / 1000000) * 100) as commission
        from live_returns r join valid_receipts receipt on receipt.return_id = r.id
        group by r.id, r.commission_given, r.commission_basis_points
      ), scoped_returns as (
        select return_id, sum(amount_paise) as collected from scoped group by return_id
      ), commissions as (
        select r.commission_given, round(r.commission::numeric * s.collected / nullif(r.all_collected, 0)) as amount,
          s.collected < r.all_collected as allocated
        from return_amounts r join scoped_returns s on s.return_id = r.id
      ), financial as (
        select coalesce(sum(amount_paise), 0) as collected, count(*)::integer as receipts,
          count(distinct case when name <> '' then case when phone ~ '^[6-9][0-9]{9}$'
            then jsonb_build_array(lower(name), phone)::text else id::text end end)::integer as donors,
          coalesce(sum(amount_paise) filter (where payment = 'CASH'), 0) as cash,
          coalesce(sum(amount_paise) filter (where payment = 'DIGITAL'), 0) as digital,
          coalesce(sum(amount_paise) filter (where payment = 'CHEQUE'), 0) as cheque,
          coalesce(sum(amount_paise) filter (where book_type = 'REGULAR'), 0) as regular,
          coalesce(sum(amount_paise) filter (where book_type = 'TOKEN'), 0) as token
        from scoped
      ), commission_totals as (
        select coalesce(sum(amount), 0) as total, coalesce(sum(amount) filter (where commission_given), 0) as paid,
          coalesce(bool_or(allocated), false) as allocated from commissions
      ), inventory as (
        select count(*)::integer as total, count(*) filter (where status = 'IN_STOCK')::integer as stock,
          count(*) filter (where status = 'CLOSED')::integer as closed,
          count(*) filter (where status = 'PARTLY_USED')::integer as partly,
          count(*) filter (where status = 'LOST')::integer as lost,
          count(*) filter (where status = 'FLAGGED')::integer as flagged from live_books
      ), open_cases as materialized (
        select c.id, a.expected_return_date from public.book_cases c
        join live_books b on b.id = c.book_id
        join public.book_assignments a on a.id = c.assignment_id and a.deleted_at is null
        where c.closed_at is null
      ), current_cases as (
        select count(*)::integer as assigned,
          count(*) filter (where expected_return_date < (select today from clock))::integer as overdue,
          count(*) filter (where not exists(select 1 from live_returns r where r.case_id = open_cases.id))::integer as unsubmitted from open_cases
      ), leftovers as (
        select count(*)::integer as books, coalesce(sum(l.receipt_to::bigint - l.receipt_from + 1), 0) as receipts
        from public.leftover_books l join live_books b on b.id = l.book_id
        where l.deleted_at is null and l.status = 'AVAILABLE'
      ), fundraiser_counts as (
        select count(*)::integer as total, count(*) filter (where p.status = 'ACTIVE')::integer as active,
          count(*) filter (where p.status = 'ACTIVE' and f.leftover_eligible)::integer as eligible
        from public.people p join public.fundraisers f on f.person_id = p.id and f.deleted_at is null
        where p.role = 'COLLECTOR' and p.deleted_at is null
      ), admin_counts as (
        select case when ${actor.role === "SUPER_ADMIN"} then count(*)::integer end as total,
          case when ${actor.role === "SUPER_ADMIN"} then count(*) filter (where status = 'ACTIVE')::integer end as active
        from public.people where role in ('SUPER_ADMIN', 'ADMIN') and deleted_at is null
      ), trend_end as (
        select starts, coalesce((select max(donation_date) from scoped), ends) as ends from bounds
      ), buckets as (
        select bucket from trend_end cross join lateral generate_series(
          greatest(date_trunc(${unit}, starts::timestamp), date_trunc(${unit}, ends::timestamp) - ${lookback}::interval),
          date_trunc(${unit}, ends::timestamp), ${step}::interval) as series(bucket)
      ), trend as (
        select bucket::date as day, coalesce(sum(s.amount_paise), 0) as amount
        from buckets left join scoped s on date_trunc(${unit}, s.donation_date::timestamp) = bucket group by bucket
      ), recent as (
        select * from scoped order by donation_date desc, updated_at desc, id desc limit 8
      )
      select case when (select allowed from access) then jsonb_build_object(
        'from', bounds.starts, 'to', bounds.ends, 'asOf', bounds.today,
        'collection', jsonb_build_object('collectedPaise', financial.collected, 'commissionPaise', commission_totals.total,
          'paidCommissionPaise', commission_totals.paid, 'netPaise', financial.collected - commission_totals.total,
          'receipts', financial.receipts, 'namedDonors', financial.donors,
          'cashPaise', financial.cash, 'digitalPaise', financial.digital, 'chequePaise', financial.cheque,
          'regularPaise', financial.regular, 'tokenPaise', financial.token, 'commissionAllocated', commission_totals.allocated),
        'books', jsonb_build_object('total', inventory.total, 'inStock', inventory.stock, 'assigned', current_cases.assigned,
          'closed', inventory.closed, 'partlyUsed', inventory.partly, 'lost', inventory.lost, 'flagged', inventory.flagged,
          'editions', (select count(*) from public.master_records where kind = 'EDITION' and deleted_at is null),
          'leftoverBooks', leftovers.books, 'leftoverReceipts', leftovers.receipts),
        'people', jsonb_build_object('fundraisers', fundraiser_counts.total, 'activeFundraisers', fundraiser_counts.active,
          'eligibleFundraisers', fundraiser_counts.eligible, 'admins', admin_counts.total, 'activeAdmins', admin_counts.active),
        'workflow', jsonb_build_object('overdueBooks', current_cases.overdue, 'unsubmittedBooks', current_cases.unsubmitted,
          'draftSubmissions', (select count(*) from live_returns where finalized_at is null),
          'uncheckedReceipts', (select count(*) from receipt_source receipt join live_returns r on r.id = receipt.return_id where not receipt.checked and r.finalized_at is null),
          'openFlags', (select count(*) from public.book_flags flag join live_returns r on r.id = flag.return_id where flag.deleted_at is null and flag.status <> 'RESOLVED'),
          'openIssues', (select count(*) from public.receipt_issues issue join live_returns r on r.id = issue.return_id where issue.status = 'OPEN'),
          'pendingEdits', (select count(*) from public.receipt_edit_requests request join live_returns r on r.id = request.return_id where request.status = 'PENDING'),
          'pendingProfiles', (select count(*) from public.collector_edit_requests where status = 'PENDING' and deleted_at is null)),
        'trend', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'amountPaise', amount) order by day) from trend), '[]'::jsonb),
        'recent', coalesce((select jsonb_agg(jsonb_build_object('id', receipt.id, 'returnId', receipt.return_id,
          'name', receipt.name, 'anonymous', receipt.anonymous, 'bookNumber', book.book_number, 'editionName', book.edition_name_en,
          'amountPaise', receipt.amount_paise, 'date', receipt.donation_date, 'payment', receipt.payment, 'checked', receipt.checked)
          order by receipt.donation_date desc, receipt.updated_at desc, receipt.id desc)
          from recent receipt join public.books book on book.id = receipt.book_id), '[]'::jsonb)
      ) else null end as data
      from bounds cross join financial cross join commission_totals cross join inventory cross join current_cases
        cross join leftovers cross join fundraiser_counts cross join admin_counts`);
    onTiming?.("dashboard_sql", performance.now() - queryStartedAt);
    if (!result?.data) throw new AuthFailure("ACCESS_DENIED");
    return dashboardSchema.parse(result.data);
  });
}
