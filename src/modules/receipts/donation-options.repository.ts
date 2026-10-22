import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { masterRecords } from "@/lib/db/schema";
import { withBooksDatabase } from "@/modules/books/books.repository";

export default async function loadReceiptDonationOptions() {
  return withBooksDatabase(async (tx) => {
    const rows = await tx.select({ id: masterRecords.id, kind: masterRecords.kind, parentId: masterRecords.parentId,
      nameEn: masterRecords.nameEn, nameUr: masterRecords.nameUr, needsDetail: masterRecords.needsDetail,
    }).from(masterRecords).where(and(inArray(masterRecords.kind, ["DONATION_CATEGORY", "DONATION_HEAD"]),
      eq(masterRecords.active, true), isNull(masterRecords.deletedAt)))
      .orderBy(asc(masterRecords.sortOrder), asc(masterRecords.nameEn), asc(masterRecords.id));
    const heads = new Map<string, { id: string; nameEn: string; nameUr: string; needsDetail: boolean }[]>();
    for (const row of rows) if (row.kind === "DONATION_HEAD" && row.parentId) {
      const group = heads.get(row.parentId) ?? [];
      group.push({ id: row.id, nameEn: row.nameEn, nameUr: row.nameUr, needsDetail: row.needsDetail });
      heads.set(row.parentId, group);
    }
    return { categories: rows.filter((row) => row.kind === "DONATION_CATEGORY").map((row) => ({
      id: row.id, nameEn: row.nameEn, nameUr: row.nameUr, heads: heads.get(row.id) ?? [],
    })) };
  });
}
