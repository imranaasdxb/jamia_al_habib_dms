import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getAccountContext } from "@/lib/auth/session";
import { withRequestDatabase } from "@/lib/db";
import { collectorEditRequests, collectors, people } from "@/lib/db/schema";
import { readProfilePhoto, removeProfilePhoto, uploadProfilePhoto } from "@/lib/storage/profile-photos";
import { AuthFailure } from "@/modules/auth/auth.types";
import { collectorRequestSchema, collectorRowSchema, collectorValuesSchema } from "@/modules/people/people.schema";
import type { RequestDatabase } from "@/lib/db";
import type { CollectorQuery, CollectorRow, CollectorSubmission, CollectorValues } from "@/modules/people/people.schema";

type Context = NonNullable<Awaited<ReturnType<typeof getAccountContext>>>;
async function requireContext(touch = true) {
  const context = await getAccountContext(touch);
  if (!context) throw new AuthFailure("SESSION_EXPIRED", 401);
  return context;
}
async function withPeopleDatabase<T>(operation: (tx: RequestDatabase, context: Context) => Promise<T>, supplied?: Context) {
  const context = supplied ?? await requireContext();
  return withRequestDatabase({ email: context.identity.email, authUserId: context.identity.id }, async (tx) => {
    const [actor] = await tx.select({ role: people.role }).from(people).where(and(
      eq(people.id, context.account.id), eq(people.authUserId, context.identity.id),
      eq(people.status, "ACTIVE"), isNull(people.deletedAt),
    )).limit(1).for("share");
    if (!actor || actor.role !== context.account.role) throw new AuthFailure("ACCESS_DENIED");
    await tx.execute(sql`select set_config('app.person_id', ${context.account.id}, true),
      set_config('app.role', ${context.account.role}, true)`);
    return operation(tx, context);
  });
}

function collectorQuery(tx: RequestDatabase) {
  return tx.select({ id: people.id, fullName: people.fullName, phone: people.phone, email: people.email,
    age: people.age, gender: people.gender, language: people.language, status: people.status,
    remarks: people.remarks, updatedAt: people.updatedAt, photoKey: people.profilePhotoKey,
    code: collectors.code, fatherName: collectors.fatherName, whatsapp: collectors.whatsapp,
    idProofName: collectors.idProofName, commissionBasisPoints: collectors.commissionBasisPoints,
    leftoverEligible: collectors.leftoverEligible,
    village: collectors.village, postOffice: collectors.postOffice, block: collectors.block,
    district: collectors.district, state: collectors.state, pin: collectors.pin,
  }).from(people).innerJoin(collectors, eq(collectors.personId, people.id));
}
type CollectorRecord = Awaited<ReturnType<typeof collectorQuery>>[number];
function serialize(row: CollectorRecord): CollectorRow {
  const { photoKey, commissionBasisPoints, ...publicValues } = row;
  return collectorRowSchema.parse({ ...publicValues, email: row.email ?? "", age: String(row.age),
    updatedAt: row.updatedAt.toISOString(), hasPhoto: photoKey !== null,
    commission: commissionBasisPoints === null ? "" : String(commissionBasisPoints / 100) });
}
const liveCollectors = and(eq(people.role, "COLLECTOR"), isNull(people.deletedAt), isNull(collectors.deletedAt));
async function findCollector(tx: RequestDatabase, id: string, lock = false) {
  const query = collectorQuery(tx).where(and(liveCollectors, eq(people.id, id))).limit(1);
  // Staff cannot lock existing collector rows for update under their read-only RLS policy.
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new AuthFailure("COLLECTOR_NOT_FOUND", 404);
  return row;
}
const literalLike = (value: string) => `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

export async function listCollectors(query: CollectorQuery) {
  return withPeopleDatabase(async (tx) => {
    const term = literalLike(query.search);
    const area = literalLike(query.area);
    const where = and(liveCollectors,
      query.status === "ALL" ? undefined : eq(people.status, query.status),
      query.leftoverEligible === "YES" ? eq(collectors.leftoverEligible, true) : undefined,
      query.search ? or(ilike(people.fullName, term), ilike(people.phone, term), ilike(people.email, term), ilike(collectors.code, term)) : undefined,
      query.area ? or(ilike(collectors.village, area), ilike(collectors.district, area), ilike(collectors.block, area)) : undefined);
    const [result] = await tx.select({ total: count() }).from(people)
      .innerJoin(collectors, eq(collectors.personId, people.id)).where(where);
    const total = result?.total ?? 0;
    const pageSize = 20;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await collectorQuery(tx).where(where).orderBy(desc(people.createdAt), desc(people.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    return { collectors: rows.map(serialize), total, page, pageSize };
  });
}

function personValues(values: CollectorValues) {
  return { fullName: values.fullName, phone: values.phone, email: values.email || null,
    age: Number(values.age), gender: values.gender, language: values.language, status: values.status,
    address: [values.village, values.postOffice, values.block, values.district, values.state, values.pin].filter(Boolean).join(", "),
    remarks: values.remarks };
}
function detailValues(values: CollectorValues) {
  return { fatherName: values.fatherName, whatsapp: values.whatsapp, idProofName: values.idProofName,
    commissionBasisPoints: values.commission === "" ? null : Math.round(Number(values.commission) * 100),
    village: values.village, postOffice: values.postOffice, block: values.block,
    district: values.district, state: values.state, pin: values.pin };
}
async function applyChanges(tx: RequestDatabase, actorId: string, id: string, values: CollectorValues, photoKey: string | null) {
  await tx.update(people).set({ ...personValues(values), profilePhotoKey: photoKey,
    updatedBy: actorId, updatedAt: new Date() }).where(eq(people.id, id));
  await tx.update(collectors).set({ ...detailValues(values), updatedBy: actorId, updatedAt: new Date() })
    .where(eq(collectors.personId, id));
  return serialize(await findCollector(tx, id));
}

export async function setCollectorEligibility(id: string, input: { leftoverEligible: boolean; version: string }) {
  return withPeopleDatabase(async (tx, { account }) => {
    if (account.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dms:collector:${id}`}))`);
    const previous = await findCollector(tx, id, true);
    if (previous.updatedAt.toISOString() !== input.version) throw new AuthFailure("STALE_COLLECTOR", 409);
    if (previous.leftoverEligible === input.leftoverEligible) return serialize(previous);
    const reason = input.leftoverEligible ? "Enabled leftover book assignment eligibility" : "Disabled leftover book assignment eligibility";
    await tx.execute(sql`select set_config('app.change_reason', ${reason}, true)`);
    const updatedAt = new Date();
    await tx.update(people).set({ updatedAt, updatedBy: account.id }).where(eq(people.id, id));
    await tx.update(collectors).set({ leftoverEligible: input.leftoverEligible, updatedAt, updatedBy: account.id })
      .where(eq(collectors.personId, id));
    return serialize(await findCollector(tx, id));
  });
}

export async function saveCollector(input: CollectorSubmission, photo: File | null, existingId?: string) {
  const context = await requireContext();
  const id = existingId ?? randomUUID();
  if (existingId && (!input.version || input.reason.length < 3)) throw new AuthFailure("INVALID_INPUT", 400);
  let uploadedKey: string | null = null;
  let committed = false;
  try {
    if (photo) uploadedKey = await uploadProfilePhoto(id, photo);
    const result = await withPeopleDatabase(async (tx, { account }) => {
      await tx.execute(sql`select set_config('app.change_reason', ${input.reason || "Collector registration"}, true)`);
      if (!existingId) {
        await tx.insert(people).values({ id, ...personValues(input.values), role: "COLLECTOR",
          profilePhotoKey: uploadedKey, createdBy: account.id, updatedBy: account.id });
        await tx.insert(collectors).values({ personId: id, ...detailValues(input.values), createdBy: account.id, updatedBy: account.id });
        return { requested: false, collector: serialize(await findCollector(tx, id)), oldKey: null };
      }
      // Serialize edits/reviews without granting Staff UPDATE access to collector records.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dms:collector:${id}`}))`);
      const previous = await findCollector(tx, id, account.role === "ADMIN");
      if (previous.updatedAt.toISOString() !== input.version) throw new AuthFailure("STALE_COLLECTOR", 409);
      const photoChanged = Boolean(photo) || input.removePhoto;
      const photoKey = photo ? uploadedKey : input.removePhoto ? null : previous.photoKey;
      if (account.role === "STAFF") {
        const [pending] = await tx.select({ id: collectorEditRequests.id }).from(collectorEditRequests)
          .where(and(eq(collectorEditRequests.collectorId, id), eq(collectorEditRequests.status, "PENDING"), isNull(collectorEditRequests.deletedAt))).limit(1);
        if (pending) throw new AuthFailure("COLLECTOR_REQUEST_PENDING", 409);
        await tx.insert(collectorEditRequests).values({ collectorId: id, requestedBy: account.id,
          version: previous.updatedAt.toISOString(), oldValues: collectorValuesSchema.strip().parse(serialize(previous)), newValues: input.values,
          reason: input.reason, photoChanged, proposedPhotoKey: photoChanged ? photoKey : null,
          oldHasPhoto: previous.photoKey !== null, createdBy: account.id, updatedBy: account.id });
        return { requested: true, collector: serialize(previous), oldKey: null };
      }
      return { requested: false, collector: await applyChanges(tx, account.id, id, input.values, photoKey),
        oldKey: photoChanged && previous.photoKey !== photoKey ? previous.photoKey : null };
    }, context);
    committed = true;
    if (result.oldKey) await removeProfilePhoto(result.oldKey).catch(() => undefined);
    return { requested: result.requested, collector: result.collector };
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if ([error, cause].some((value) => typeof value === "object" && value !== null
      && "constraint_name" in value && value.constraint_name === "collector_requests_pending_idx")) {
      throw new AuthFailure("COLLECTOR_REQUEST_PENDING", 409);
    }
    throw error;
  } finally {
    if (!committed && uploadedKey) await removeProfilePhoto(uploadedKey).catch(() => undefined);
  }
}

export async function listCollectorRequests(page: number) {
  return withPeopleDatabase(async (tx) => {
    const where = isNull(collectorEditRequests.deletedAt);
    const [result] = await tx.select({ total: count() }).from(collectorEditRequests).where(where);
    const total = result?.total ?? 0;
    const pageSize = 20;
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const requester = alias(people, "collector_requester");
    const rows = await tx.select({ request: collectorEditRequests, collectorName: people.fullName, requestedByName: requester.fullName })
      .from(collectorEditRequests).innerJoin(people, eq(people.id, collectorEditRequests.collectorId))
      .leftJoin(requester, eq(requester.id, collectorEditRequests.requestedBy))
      .where(where).orderBy(desc(collectorEditRequests.createdAt)).limit(pageSize).offset((currentPage - 1) * pageSize);
    const data = [];
    for (const { request, collectorName, requestedByName } of rows) {
      data.push(collectorRequestSchema.parse({ id: request.id, collectorId: request.collectorId, collectorName,
        requestedByName: requestedByName ?? "", reason: request.reason, status: request.status, createdAt: request.createdAt.toISOString(),
        reviewNote: request.reviewNote, oldValues: request.oldValues, newValues: request.newValues,
        photoChanged: request.photoChanged, oldHasPhoto: request.oldHasPhoto,
        newHasPhoto: request.photoChanged ? request.proposedPhotoKey !== null : request.oldHasPhoto }));
    }
    return { requests: data, total, page: currentPage, pageSize };
  });
}

export async function reviewCollectorRequest(id: string, decision: "APPROVED" | "REJECTED", note: string) {
  const result = await withPeopleDatabase(async (tx, { account }) => {
    if (account.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
    const [request] = await tx.select().from(collectorEditRequests)
      .where(and(eq(collectorEditRequests.id, id), isNull(collectorEditRequests.deletedAt))).limit(1);
    if (!request) throw new AuthFailure("COLLECTOR_NOT_FOUND", 404);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dms:collector:${request.collectorId}`})),
      set_config('app.change_reason', ${`${request.reason} — ${note}`}, true)`);
    const previous = await findCollector(tx, request.collectorId, true);
    const [locked] = await tx.select().from(collectorEditRequests).where(eq(collectorEditRequests.id, id)).limit(1).for("update");
    if (!locked || locked.status !== "PENDING") throw new AuthFailure("COLLECTOR_REQUEST_CLOSED", 409);
    let collector = serialize(previous);
    let oldKey: string | null = null;
    if (decision === "APPROVED") {
      if (previous.updatedAt.toISOString() !== locked.version) throw new AuthFailure("STALE_COLLECTOR", 409);
      const values = collectorValuesSchema.parse(locked.newValues);
      const photoKey = locked.photoChanged ? locked.proposedPhotoKey : previous.photoKey;
      collector = await applyChanges(tx, account.id, previous.id, values, photoKey);
      if (locked.photoChanged && previous.photoKey !== photoKey) oldKey = previous.photoKey;
    } else if (locked.photoChanged) oldKey = locked.proposedPhotoKey;
    await tx.update(collectorEditRequests).set({ status: decision, reviewedBy: account.id,
      reviewNote: note, reviewedAt: new Date(), updatedBy: account.id, updatedAt: new Date() })
      .where(eq(collectorEditRequests.id, id));
    return { collector, oldKey };
  });
  if (result.oldKey) await removeProfilePhoto(result.oldKey).catch(() => undefined);
  return { collector: result.collector };
}

export async function collectorPhoto(id: string, requestId: string | null) {
  const context = await requireContext(false);
  const key = await withPeopleDatabase(async (tx) => {
    const collector = await findCollector(tx, id);
    if (!requestId) return collector.photoKey;
    const [request] = await tx.select({ proposedPhotoKey: collectorEditRequests.proposedPhotoKey,
      photoChanged: collectorEditRequests.photoChanged, status: collectorEditRequests.status }).from(collectorEditRequests)
      .where(and(eq(collectorEditRequests.id, requestId), eq(collectorEditRequests.collectorId, id),
        isNull(collectorEditRequests.deletedAt))).limit(1);
    if (!request || request.status === "REJECTED") throw new AuthFailure("COLLECTOR_NOT_FOUND", 404);
    return request.photoChanged ? request.proposedPhotoKey : collector.photoKey;
  }, context);
  if (!key) throw new AuthFailure("COLLECTOR_NOT_FOUND", 404);
  return readProfilePhoto(key);
}
