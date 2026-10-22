import "server-only";
import { sql } from "drizzle-orm";
import { AuthFailure } from "@/modules/auth/auth.types";
import { withBooksDatabase } from "@/modules/books/books.repository";
import { leftoverOptionsDataSchema } from "@/modules/books/leftovers.schema";
import type { LeftoverOptionsQuery } from "@/modules/books/leftovers.schema";

const literalLike = (value: string) => `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
export async function leftoverReassignOptions(query: LeftoverOptionsQuery) {
  return withBooksDatabase(async (tx, actor) => {
    if (actor.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const term = literalLike(query.search); const area = literalLike(query.areaSearch);
    const [row] = await tx.execute<{ data: unknown }>(sql`
      select jsonb_build_object(
        'fundraisers', coalesce((select jsonb_agg(f) from (
          select p.id, p.full_name as "fullName", c.code, p.phone, c.village, c.district,
            (p.profile_photo_key is not null) as "hasPhoto", p.updated_at::text as "photoVersion"
          from public.people p inner join public.collectors c on c.person_id = p.id
          where p.role = 'COLLECTOR' and p.status = 'ACTIVE' and p.deleted_at is null
            and c.deleted_at is null and c.leftover_eligible = true
            ${query.search ? sql`and (p.full_name ilike ${term} or c.code ilike ${term} or p.phone ilike ${term})` : sql``}
          order by p.full_name, p.id limit 21 offset ${(query.page - 1) * 20}
        ) f), '[]'::jsonb),
        'areas', coalesce((select jsonb_agg(a) from (
          select id, name_en as "nameEn", name_ur as "nameUr" from public.master_records
          where kind = 'AREA' and active = true and deleted_at is null
            ${query.areaSearch ? sql`and (name_en ilike ${area} or name_ur ilike ${area} or code ilike ${area})` : sql``}
          order by name_en, id limit 51 offset ${(query.areaPage - 1) * 50}
        ) a), '[]'::jsonb),
        'returnMonths', (select default_return_months from public.app_settings where slot = 1 and deleted_at is null)
      ) as data`);
    const data = leftoverOptionsDataSchema.parse(row?.data);
    return { fundraisers: data.fundraisers.slice(0, 20).map((fundraiser) => ({ ...fundraiser,
      photoUrl: fundraiser.hasPhoto ? `/api/v1/people/${fundraiser.id}/photo?v=${encodeURIComponent(fundraiser.photoVersion)}` : null })),
      areas: data.areas.slice(0, 50), returnMonths: data.returnMonths,
      fundraiserHasMore: data.fundraisers.length > 20, areaHasMore: data.areas.length > 50 };
  });
}
