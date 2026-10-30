import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { certificateSchema } from "@/modules/books/certificates.schema";
import type { CertificateScope } from "@/modules/books/certificates.schema";

export async function readAuthorizationCertificate(assignmentId: string, scope: CertificateScope = "ASSIGNMENT") {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const [row] = await tx.execute<{ data: unknown }>(sql`
      with seed as (
        select id, collector_id from public.book_assignments where id = ${assignmentId}::uuid and deleted_at is null
      ), assignments as materialized (
        select a.id, a.number, a.collector_name, a.collector_code, a.address, a.phone, a.remarks, a.assignment_date,
          coalesce(f.father_name, '') as father_name, cert.certificate_sequence,
          least(a.expected_return_date, (a.assignment_date + interval '11 months')::date) as expires_on,
          p.status <> 'ACTIVE' or p.deleted_at is not null as revoked
        from public.book_assignments a join seed s on ${scope === "FUNDRAISER" ? sql`a.collector_id = s.collector_id` : sql`a.id = s.id`}
        join public.people p on p.id = a.collector_id
        left join public.fundraisers f on f.person_id = p.id and f.deleted_at is null
        left join public.assignment_authorization_certificates cert on cert.assignment_id = a.id
        where a.deleted_at is null and ${scope === "FUNDRAISER" ? sql`exists (
          select 1 from public.book_cases c join public.books b on b.id = c.book_id and b.deleted_at is null
          where c.assignment_id = a.id and c.closed_at is null)` : sql`true`}
      ), anchor as (
        select * from assignments order by certificate_sequence nulls last, assignment_date, id limit 1
      ), assigned_books as materialized (
        select c.id, c.receipt_from, c.receipt_to, a.number as assignment_number, a.assignment_date,
          a.expires_on, a.remarks ilike '%historical%' as historical,
          b.edition_number, b.edition_book_number, b.edition_name_en,
          case when b.edition_number is null then '' else 'ED-' || lpad(b.edition_number::text, greatest(2,length(b.edition_number::text)), '0') || '-' end
            || case when b.book_type = 'TOKEN' then 'T-' || (b.token_value_paise / 100)::text || '-' else '' end
            || case when b.edition_book_number is null then b.book_number
              else 'Book' || b.edition_book_number::text || '/' || b.receipt_from::text end as book_number,
          least(a.expires_on, (c.authorization_ended_at at time zone 'Asia/Kolkata')::date) as valid_until,
          case when a.revoked or c.authorization_end_reason = 'LOST' then 'REVOKED'
            when c.authorization_ended_at is not null then 'CLOSED'
            when (now() at time zone 'Asia/Kolkata')::date > a.expires_on then 'EXPIRED'
            when (now() at time zone 'Asia/Kolkata')::date < a.assignment_date then 'NOT_STARTED' else 'ACTIVE' end as status
        from public.book_cases c join assignments a on a.id = c.assignment_id
        join public.books b on b.id = c.book_id and b.deleted_at is null
        where ${scope === "FUNDRAISER" ? sql`c.closed_at is null` : sql`true`}
      ), book_state as (
        select count(*) as total, min(assignment_date) as starts, max(expires_on) as expires,
          max(valid_until) as ends, bool_or(historical) as historical,
          bool_or(status = 'ACTIVE') as any_active, bool_or(status = 'NOT_STARTED') as any_future,
          bool_or(status = 'EXPIRED') as any_expired, bool_and(status = 'REVOKED') as all_revoked
        from assigned_books
      )
      select jsonb_build_object(
        'scope', ${scope}::text,
        'number', case when certificate_sequence is not null then 'JAH-CERT-' ||
          lpad(certificate_sequence::text, greatest(6, length(certificate_sequence::text)), '0') end,
        'assignmentNumber', (select string_agg(distinct assignment_number, ', ' order by assignment_number) from assigned_books),
        'collectorName', collector_name, 'collectorCode', collector_code,
        'fatherName', father_name, 'address', address, 'phone', phone,
        'books', (select jsonb_agg(jsonb_build_object('id', id, 'number', book_number,
          'editionName', edition_name_en, 'assignmentNumber', assignment_number,
          'receiptFrom', receipt_from, 'receiptTo', receipt_to,
          'status', status, 'validFrom', assignment_date, 'validUntil', valid_until)
          order by edition_number nulls last, edition_book_number nulls last, receipt_from, id) from assigned_books),
        'validFrom', book_state.starts, 'expiresOn', book_state.expires, 'validUntil', book_state.ends,
        'historical', book_state.historical,
        'status', case when revoked or book_state.all_revoked then 'REVOKED'
          when book_state.any_active then 'ACTIVE' when book_state.any_future then 'NOT_STARTED'
          when book_state.any_expired then 'EXPIRED' else 'CLOSED' end
      ) as data from anchor a cross join book_state where book_state.total > 0`);
    if (!row) throw new AuthFailure("CERTIFICATE_NOT_FOUND", 404);
    if (typeof row.data === "object" && row.data !== null && "number" in row.data && row.data.number === null) {
      throw new AuthFailure("CERTIFICATE_SETUP_REQUIRED", 503);
    }
    return certificateSchema.parse(row.data);
  });
}
