import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, getTableColumns, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getAccountContext } from "@/lib/auth/session";
import { withRequestDatabase } from "@/lib/db";
import { masterRecords, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { fixedMasterKinds, masterRowSchema } from "@/modules/masters/masters.schema";
import { editionLabel } from "@/modules/masters/editions.schema";
import { readProfilePhoto, removeProfilePhoto, uploadEditionReceiptSample } from "@/lib/storage/profile-photos";
import type { RequestDatabase } from "@/lib/db";
import type { MasterQuery, MasterSubmission } from "@/modules/masters/masters.schema";

async function withMastersDatabase<T>(operation: (tx: RequestDatabase, actorId: string) => Promise<T>, adminOnly = true) {
  const context = await getAccountContext(true);
  if (!context) throw new AuthFailure("SESSION_EXPIRED", 401);
  if (adminOnly && context.account.role !== "SUPER_ADMIN") throw new AuthFailure("ACCESS_DENIED");
  return withRequestDatabase({ email: context.identity.email, authUserId: context.identity.id }, async (tx) => {
    const [actor] = await tx.select({ id: people.id, role: people.role }).from(people).where(and(
      eq(people.id, context.account.id), eq(people.authUserId, context.identity.id),
      eq(people.status, "ACTIVE"), isNull(people.deletedAt),
    )).limit(1).for("share");
    if (!actor || actor.role !== context.account.role) throw new AuthFailure("ACCESS_DENIED");
    await tx.execute(sql`select set_config('app.person_id', ${actor.id}, true), set_config('app.role', ${actor.role}, true)`);
    return operation(tx, actor.id);
  });
}
// Optional image metadata must not make the existing master data depend on migration 0028.
// Reading the row as JSON returns NULL for this key until the column is installed.
const recordColumns = { ...getTableColumns(masterRecords),
  editionReceiptPhotoKey: sql<string | null>`to_jsonb(${masterRecords})->>'edition_receipt_photo_key'` };
function recordQuery(tx: RequestDatabase) {
  const parent = alias(masterRecords, "parent_master");
  return tx.select({ record: recordColumns, parentNameEn: parent.nameEn, parentNameUr: parent.nameUr })
    .from(masterRecords).leftJoin(parent, eq(parent.id, masterRecords.parentId));
}
type RecordResult = Awaited<ReturnType<typeof recordQuery>>[number];
function serialize({ record, parentNameEn, parentNameUr }: RecordResult) {
  return masterRowSchema.parse({ id: record.id, kind: record.kind, code: record.code, nameEn: record.nameEn,
    nameUr: record.nameUr, active: record.active, builtIn: record.builtIn, notes: record.notes,
    hasReceiptSample: record.editionReceiptPhotoKey !== null,
    edition: record.kind === "EDITION" && record.editionNumber !== null ? {
      editionNumber: String(record.editionNumber), editionCode: record.editionCode ?? record.code,
      bookType: record.editionBookType,
      tokenValue: record.editionTokenValuePaise === null ? "" : String(record.editionTokenValuePaise / 100), bookFrom: record.editionBookFrom ?? 1, printingYear: String(record.printingYear ?? ""),
      pagesFrom: String(record.pagesFrom ?? ""), pagesTo: String(record.pagesTo ?? ""),
      pagesPerBook: record.pagesPerBook, quantity: record.bookQuantity, designedPrintedBy: record.designedPrintedBy ?? "",
    } : null,
    needsDetail: record.needsDetail, level: record.level ?? "",
    parentId: record.parentId ?? "", parentNameEn: parentNameEn ?? "", parentNameUr: parentNameUr ?? "",
    tokenValue: record.tokenValueRupees === null ? "" : String(record.tokenValueRupees),
    accountName: record.accountName, lastFour: record.lastFour, upiId: record.upiId,
    updatedAt: record.updatedAt.toISOString() });
}
const literalLike = (term: string) => `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
export async function listMasterRecords(query: MasterQuery, options = false) {
  return withMastersDatabase(async (tx) => {
    const term = literalLike(query.search);
    const where = and(eq(masterRecords.kind, query.kind), isNull(masterRecords.deletedAt),
      options ? eq(masterRecords.active, true) : query.status === "ALL" ? undefined : eq(masterRecords.active, query.status === "ACTIVE"),
      query.kind === "EDITION" && query.bookType ? eq(masterRecords.editionBookType, query.bookType) : undefined,
      query.level ? eq(masterRecords.level, query.level) : undefined,
      query.kind === "AREA" && query.geographyOnly === "YES"
        ? sql`${masterRecords.level} in ('STATE', 'DISTRICT', 'BLOCK', 'VILLAGE')` : undefined,
      options && query.parentId ? eq(masterRecords.parentId, query.parentId) : undefined,
      query.search ? or(ilike(masterRecords.nameEn, term), ilike(masterRecords.nameUr, term), ilike(masterRecords.code, term)) : undefined);
    const [result] = await tx.select({ total: count() }).from(masterRecords).where(where);
    const total = result?.total ?? 0;
    const pageSize = options ? 50 : 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    if (options) {
      const order = query.kind === "DONATION_HEAD" || query.kind === "DONATION_CATEGORY"
        ? [asc(masterRecords.sortOrder), asc(masterRecords.nameEn), asc(masterRecords.id)]
        : query.kind === "AREA" ? [asc(masterRecords.nameEn), asc(masterRecords.id)] : [desc(masterRecords.createdAt), desc(masterRecords.id)];
      const rows = await tx.select({ id: masterRecords.id, nameEn: masterRecords.nameEn, nameUr: masterRecords.nameUr,
        ...(query.kind === "DONATION_HEAD" ? { needsDetail: masterRecords.needsDetail } : {}),
        ...(query.kind === "BOOK_TYPE" ? { code: masterRecords.code } : {}),
        ...(query.kind === "TOKEN_VALUE" ? { tokenValue: sql<string>`${masterRecords.tokenValueRupees}::text` } : {}),
      }).from(masterRecords).where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize);
      return { rows, total, page, pageSize };
    }
    const parent = alias(masterRecords, "parent_master");
    const order = query.kind === "DONATION_HEAD" ? [asc(parent.sortOrder), asc(masterRecords.sortOrder), asc(masterRecords.nameEn)]
      : query.kind === "DONATION_CATEGORY" ? [asc(masterRecords.sortOrder), asc(masterRecords.nameEn)]
      : query.kind === "AREA" ? [asc(masterRecords.nameEn), asc(masterRecords.id)] : [desc(masterRecords.createdAt), desc(masterRecords.id)];
    const rows = await recordQuery(tx).where(where).orderBy(...order)
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(serialize), total, page, pageSize };
  }, !options);
}

const parentLevels = { DISTRICT: "STATE", BLOCK: "DISTRICT", VILLAGE: "BLOCK" } as const;
export async function saveMasterRecord(input: MasterSubmission, id?: string, photo?: File) {
  if (photo && input.kind !== "EDITION") throw new AuthFailure("INVALID_INPUT", 400);
  const recordId = id ?? randomUUID();
  let uploadedKey: string | null = null; let oldKey: string | null = null; let committed = false;
  try {
  const result = await withMastersDatabase(async (tx, actorId) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dms:masters:write')),
      set_config('app.change_reason', ${input.reason || "Master record creation"}, true)`);
    let previous: (typeof masterRecords.$inferSelect & { editionReceiptPhotoKey: string | null }) | undefined;
    if (id) {
      [previous] = await tx.select(recordColumns).from(masterRecords).where(and(eq(masterRecords.id, id), isNull(masterRecords.deletedAt))).limit(1).for("update");
      if (!previous) throw new AuthFailure("MASTER_NOT_FOUND", 404);
      if (previous.updatedAt.toISOString() !== input.version) throw new AuthFailure("STALE_MASTER", 409);
      if (input.reason.length < 3) throw new AuthFailure("INVALID_INPUT", 400);
      if (previous.kind !== input.kind || previous.code !== input.values.code
        || (previous.level ?? "") !== input.values.level
        || (previous.tokenValueRupees === null ? "" : String(previous.tokenValueRupees)) !== input.values.tokenValue) {
        throw new AuthFailure("MASTER_FIXED", 409);
      }
    } else if (fixedMasterKinds.includes(input.kind)) throw new AuthFailure("MASTER_FIXED", 403);

    const values = input.values;
    const area = input.kind === "AREA";
    const bankAccount = input.kind === "BANK_ACCOUNT";
    const donationHead = input.kind === "DONATION_HEAD";
    const parentId = area || bankAccount || donationHead ? values.parentId || null : null;
    if (parentId) {
      const [parent] = await tx.select().from(masterRecords).where(and(eq(masterRecords.id, parentId), isNull(masterRecords.deletedAt))).limit(1).for("share");
      if (!parent || (values.active && !parent.active) || parent.id === id) throw new AuthFailure("MASTER_PARENT", 409);
      if (bankAccount && parent.kind !== "BANK") throw new AuthFailure("MASTER_PARENT", 409);
      if (donationHead && parent.kind !== "DONATION_CATEGORY") throw new AuthFailure("MASTER_PARENT", 409);
      if (area) {
        if (parent.kind !== "AREA" || values.level === "" || values.level === "STATE") throw new AuthFailure("MASTER_PARENT", 409);
        if (values.level === "COLLECTION") {
          if (!["STATE", "DISTRICT", "BLOCK", "VILLAGE"].includes(parent.level ?? "")) throw new AuthFailure("MASTER_PARENT", 409);
        } else if (parent.level !== parentLevels[values.level]) throw new AuthFailure("MASTER_PARENT", 409);
      }
    }
    if (previous && !values.active) {
      const [child] = await tx.select({ id: masterRecords.id }).from(masterRecords).where(and(
        eq(masterRecords.parentId, previous.id), eq(masterRecords.active, true), isNull(masterRecords.deletedAt),
      )).limit(1);
      if (child) throw new AuthFailure("MASTER_HAS_CHILDREN", 409);
    }
    const edition = input.kind === "EDITION" ? values.edition : null;
    if (photo) {
      uploadedKey = await uploadEditionReceiptSample(recordId, photo);
      oldKey = previous?.editionReceiptPhotoKey ?? null;
    }
    const rowValues = { code: edition?.editionCode ?? (values.code || (area ? `AREA_${randomUUID().replaceAll("-", "").toUpperCase()}` : values.code)),
      nameEn: edition ? `${editionLabel(Number(edition.editionNumber))}${edition.bookType === "TOKEN" ? ` · ₹${edition.tokenValue} token` : ""}` : values.nameEn,
      nameUr: edition ? `ایڈیشن ${Number(edition.editionNumber)}${edition.bookType === "TOKEN" ? ` · ₹${edition.tokenValue} ٹوکن` : ""}` : values.nameUr || values.nameEn,
      active: values.active, notes: values.notes,
      editionCode: edition?.editionCode ?? null, editionNumber: edition ? Number(edition.editionNumber) : null,
      editionBookType: edition?.bookType ?? null,
      editionTokenValuePaise: edition?.bookType === "TOKEN" ? Number(edition.tokenValue) * 100 : null,
      printingYear: edition ? Number(edition.printingYear) : null,
      pagesFrom: edition ? Number(edition.pagesFrom) : null, pagesTo: edition ? Number(edition.pagesTo) : null,
      pagesPerBook: edition ? 50 : null, bookQuantity: edition?.quantity ?? null,
      designedPrintedBy: edition?.designedPrintedBy ?? null,
      needsDetail: donationHead && ["OTHER_OBLIGATORY", "OTHER_VOLUNTARY", "OTHER_SPECIFIED"].includes(values.code)
        ? true : ["DONATION_HEAD", "UPI_APP", "RECEIPT_REASON", "FLAG_REASON"].includes(input.kind) && values.needsDetail,
      level: area && values.level ? values.level : null, parentId,
      tokenValueRupees: input.kind === "TOKEN_VALUE" && values.tokenValue ? Number(values.tokenValue) : null,
      accountName: bankAccount ? values.accountName : "", lastFour: bankAccount ? values.lastFour : "", upiId: bankAccount ? values.upiId : "",
      updatedAt: new Date(), updatedBy: actorId };
    let savedId = id;
    if (previous) await tx.update(masterRecords).set(rowValues).where(eq(masterRecords.id, previous.id));
    else {
      const [created] = await tx.insert(masterRecords).values({ ...rowValues, id: recordId, kind: input.kind, createdBy: actorId }).returning({ id: masterRecords.id });
      savedId = created?.id;
    }
    if (!savedId) throw new AuthFailure("MASTERS_UNAVAILABLE", 503);
    if (uploadedKey) {
      await tx.execute(sql`update ${masterRecords} set edition_receipt_photo_key = ${uploadedKey}
        where ${masterRecords.id} = ${savedId} and ${masterRecords.kind} = 'EDITION'`);
    }
    const [saved] = await recordQuery(tx).where(eq(masterRecords.id, savedId)).limit(1);
    if (!saved) throw new AuthFailure("MASTERS_UNAVAILABLE", 503);
    return serialize(saved);
  });
  committed = true;
  if (oldKey) await removeProfilePhoto(oldKey).catch(() => undefined);
  return result;
  } catch (error) {
    if (uploadedKey && !committed) await removeProfilePhoto(uploadedKey).catch(() => undefined);
    throw error;
  }
}

export async function getEditionReceiptSample(id: string) {
  const key = await withMastersDatabase(async (tx) => {
    const [edition] = await tx.select({ key: recordColumns.editionReceiptPhotoKey }).from(masterRecords)
      .where(and(eq(masterRecords.id, id), eq(masterRecords.kind, "EDITION"), isNull(masterRecords.deletedAt))).limit(1);
    if (!edition?.key) throw new AuthFailure("MASTER_NOT_FOUND", 404);
    return edition.key;
  }, false);
  return readProfilePhoto(key);
}

