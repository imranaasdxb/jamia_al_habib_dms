import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getAccountContext } from "@/lib/auth/session";
import { withRequestDatabase } from "@/lib/db";
import { masterRecords, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { fixedMasterKinds, masterRowSchema } from "@/modules/masters/masters.schema";
import type { RequestDatabase } from "@/lib/db";
import type { MasterQuery, MasterSubmission } from "@/modules/masters/masters.schema";

async function withMastersDatabase<T>(operation: (tx: RequestDatabase, actorId: string) => Promise<T>, adminOnly = true) {
  const context = await getAccountContext(true);
  if (!context) throw new AuthFailure("SESSION_EXPIRED", 401);
  if (adminOnly && context.account.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
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
function recordQuery(tx: RequestDatabase) {
  const parent = alias(masterRecords, "parent_master");
  return tx.select({ record: masterRecords, parentNameEn: parent.nameEn, parentNameUr: parent.nameUr })
    .from(masterRecords).leftJoin(parent, eq(parent.id, masterRecords.parentId));
}
type RecordResult = Awaited<ReturnType<typeof recordQuery>>[number];
function serialize({ record, parentNameEn, parentNameUr }: RecordResult) {
  return masterRowSchema.parse({ id: record.id, kind: record.kind, code: record.code, nameEn: record.nameEn,
    nameUr: record.nameUr, active: record.active, builtIn: record.builtIn, notes: record.notes,
    effectiveFrom: record.effectiveFrom ?? "", needsDetail: record.needsDetail, level: record.level ?? "",
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
      query.level ? eq(masterRecords.level, query.level) : undefined,
      query.search ? or(ilike(masterRecords.nameEn, term), ilike(masterRecords.nameUr, term), ilike(masterRecords.code, term)) : undefined);
    const [result] = await tx.select({ total: count() }).from(masterRecords).where(where);
    const total = result?.total ?? 0;
    const pageSize = options ? 50 : 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const parent = alias(masterRecords, "parent_master");
    const order = query.kind === "DONATION_HEAD" ? [asc(parent.sortOrder), asc(masterRecords.sortOrder), asc(masterRecords.nameEn)]
      : query.kind === "DONATION_CATEGORY" ? [asc(masterRecords.sortOrder), asc(masterRecords.nameEn)]
      : [desc(masterRecords.createdAt), desc(masterRecords.id)];
    const rows = await recordQuery(tx).where(where).orderBy(...order)
      .limit(pageSize).offset((page - 1) * pageSize);
    return { rows: rows.map(serialize), total, page, pageSize };
  }, !options);
}

const parentLevels = { DISTRICT: "STATE", BLOCK: "DISTRICT", VILLAGE: "BLOCK" } as const;
export async function saveMasterRecord(input: MasterSubmission, id?: string) {
  return withMastersDatabase(async (tx, actorId) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('dms:masters:write')),
      set_config('app.change_reason', ${input.reason || "Master record creation"}, true)`);
    let previous: typeof masterRecords.$inferSelect | undefined;
    if (id) {
      [previous] = await tx.select().from(masterRecords).where(and(eq(masterRecords.id, id), isNull(masterRecords.deletedAt))).limit(1).for("update");
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
      if (area && (parent.kind !== "AREA" || values.level === "" || values.level === "STATE"
        || parent.level !== parentLevels[values.level])) throw new AuthFailure("MASTER_PARENT", 409);
    }
    if (previous && !values.active) {
      const [child] = await tx.select({ id: masterRecords.id }).from(masterRecords).where(and(
        eq(masterRecords.parentId, previous.id), eq(masterRecords.active, true), isNull(masterRecords.deletedAt),
      )).limit(1);
      if (child) throw new AuthFailure("MASTER_HAS_CHILDREN", 409);
    }
    const rowValues = { code: values.code, nameEn: values.nameEn, nameUr: values.nameUr,
      active: values.active, notes: values.notes, effectiveFrom: input.kind === "EDITION" ? values.effectiveFrom || null : null,
      needsDetail: donationHead && ["OTHER_OBLIGATORY", "OTHER_VOLUNTARY", "OTHER_SPECIFIED"].includes(values.code)
        ? true : ["DONATION_HEAD", "UPI_APP", "RECEIPT_REASON", "FLAG_REASON"].includes(input.kind) && values.needsDetail,
      level: area && values.level ? values.level : null, parentId,
      tokenValueRupees: input.kind === "TOKEN_VALUE" && values.tokenValue ? Number(values.tokenValue) : null,
      accountName: bankAccount ? values.accountName : "", lastFour: bankAccount ? values.lastFour : "", upiId: bankAccount ? values.upiId : "",
      updatedAt: new Date(), updatedBy: actorId };
    let savedId = id;
    if (previous) await tx.update(masterRecords).set(rowValues).where(eq(masterRecords.id, previous.id));
    else {
      const [created] = await tx.insert(masterRecords).values({ ...rowValues, kind: input.kind, createdBy: actorId }).returning({ id: masterRecords.id });
      savedId = created?.id;
    }
    if (!savedId) throw new AuthFailure("MASTERS_UNAVAILABLE", 503);
    const [saved] = await recordQuery(tx).where(eq(masterRecords.id, savedId)).limit(1);
    if (!saved) throw new AuthFailure("MASTERS_UNAVAILABLE", 503);
    return serialize(saved);
  });
}

