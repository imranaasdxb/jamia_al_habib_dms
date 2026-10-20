import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getAccountContext } from "@/lib/auth/session";
import { withRequestDatabase } from "@/lib/db";
import { people, userVerificationFlows } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { RequestDatabase } from "@/lib/db";
import type { UserProfileValues, UsersQuery } from "@/modules/users/users.schema";
import type { UsersPageData } from "@/modules/users/users.types";

type AccountContext = Awaited<ReturnType<typeof getAccountContext>>;
const userRequest = new AsyncLocalStorage<{ account?: Promise<AccountContext> }>();

export function withUsersRequest<T>(operation: () => Promise<T>) {
  return userRequest.run({}, operation);
}

export function getUsersAccount(touch = true) {
  const request = userRequest.getStore();
  if (!request) return getAccountContext(touch);
  // Request-local only: no authentication or permissions are cached between HTTP requests.
  return request.account ??= getAccountContext(touch);
}

export async function withAdminDatabase<T>(
  operation: (transaction: RequestDatabase, actorId: string) => Promise<T>,
  mutation = false,
): Promise<T> {
  const context = await getUsersAccount();
  if (!context) throw new AuthFailure("SESSION_EXPIRED", 401);
  const { account, identity } = context;
  if (account.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");

  return withRequestDatabase({ email: identity.email, authUserId: identity.id },
    async (transaction) => {
      // Acquire before locking any people rows so two administrators cannot deadlock each other.
      if (mutation) await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('dms:users:write'))`);
      const actorQuery = transaction.select({ id: people.id, role: people.role,
        status: people.status }).from(people).where(and(eq(people.id, account.id),
        eq(people.authUserId, identity.id), isNull(people.deletedAt))).limit(1);
      const [actor] = mutation ? await actorQuery.for("update") : await actorQuery;
      if (!actor || actor.role !== "ADMIN" || actor.status !== "ACTIVE") {
        throw new AuthFailure("ACCESS_DENIED");
      }
      await transaction.execute(sql`select set_config('app.person_id', ${actor.id}, true),
        set_config('app.role', 'ADMIN', true)`);
      return operation(transaction, actor.id);
    });
}

export async function listUsers(query: UsersQuery): Promise<UsersPageData> {
  return withAdminDatabase(async (transaction) => {
    const pageSize = 20;
    // Treat SQL LIKE wildcards as literal search characters.
    const term = query.search.replaceAll("\\", "\\\\").replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    const where = and(isNull(people.deletedAt), inArray(people.role, ["ADMIN", "STAFF"]),
      query.role === "ALL" ? undefined : eq(people.role, query.role),
      term ? or(ilike(people.fullName, `%${term}%`), ilike(people.email, `%${term}%`),
        ilike(people.phone, `%${term}%`)) : undefined);
    const [result] = await transaction.select({ total: count() }).from(people).where(where);
    const total = result?.total ?? 0;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
    const users = await transaction.select({ id: people.id, fullName: people.fullName,
      email: people.email, phone: people.phone, role: people.role, status: people.status,
      accountCreated: sql<boolean>`${people.authUserId} is not null`, language: people.language,
      age: people.age, gender: people.gender, address: people.address, remarks: people.remarks,
      hasPhoto: sql<boolean>`${people.profilePhotoKey} is not null`, updatedAt: people.updatedAt }).from(people)
      .where(where).orderBy(desc(people.createdAt), desc(people.id))
      .limit(pageSize).offset((page - 1) * pageSize);
    const flows = users.length ? await transaction.select({ personId: userVerificationFlows.personId,
      flowId: userVerificationFlows.id, email: userVerificationFlows.targetEmail, state: userVerificationFlows.state })
      .from(userVerificationFlows).where(and(inArray(userVerificationFlows.personId, users.map((user) => user.id)),
        ne(userVerificationFlows.state, "COMPLETE"), isNull(userVerificationFlows.deletedAt))) : [];
    const pending = new Map(flows.map((flow) => [flow.personId, { personId: flow.personId, flowId: flow.flowId,
      email: flow.email, needsVerification: true, proofComplete: flow.state === "VERIFIED" }]));
    return { users: users.map((user) => ({ ...user, verificationPending: pending.has(user.id),
      verification: pending.get(user.id) ?? null, updatedAt: user.updatedAt.toISOString() })),
      total, page, pageSize };
  });
}

export function profileColumns(values: UserProfileValues) {
  return { ...values, age: values.age ? Number(values.age) : null, phone: values.phone };
}

export async function getManagedUser(id: string) {
  return withAdminDatabase(async (transaction) => {
    const [person] = await transaction.select().from(people).where(and(eq(people.id, id),
      inArray(people.role, ["ADMIN", "STAFF"]), isNull(people.deletedAt))).limit(1);
    if (!person) throw new AuthFailure("USER_NOT_FOUND", 404);
    return person;
  });
}

export async function createUserDraft(values: UserProfileValues, existingId?: string) {
  return withAdminDatabase(async (transaction, actorId) => {
    if (existingId) {
      const { person } = await requireEditableTarget(transaction, actorId, existingId);
      if (person.authUserId || person.id === actorId) throw new AuthFailure("VERIFICATION_PENDING", 409);
      await transaction.update(userVerificationFlows).set({ deletedAt: new Date(), updatedBy: actorId })
        .where(and(eq(userVerificationFlows.personId, existingId), isNull(userVerificationFlows.deletedAt)));
      await transaction.update(people).set({ ...profileColumns(values), status: "PENDING",
        updatedBy: actorId, updatedAt: new Date() }).where(eq(people.id, existingId));
    }
    const [person] = existingId ? await transaction.select().from(people).where(eq(people.id, existingId))
      : await transaction.insert(people).values({ ...profileColumns(values),
      status: "PENDING", createdBy: actorId, updatedBy: actorId,
    }).returning();
    if (!person) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
    const [flow] = await transaction.insert(userVerificationFlows).values({ personId: person.id,
      actorId, targetEmail: values.email, purpose: "ONBOARD", details: { ...values },
      priorStatus: "ACTIVE", expiresAt: new Date(Date.now() + 600000), createdBy: actorId,
    }).returning();
    if (!flow) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
    return { person, flow };
  }, true);
}

export async function requireEditableTarget(transaction: RequestDatabase, actorId: string, id: string) {
  const [person] = await transaction.select().from(people).where(and(eq(people.id, id),
    inArray(people.role, ["ADMIN", "STAFF"]), isNull(people.deletedAt))).limit(1).for("update");
  if (!person) throw new AuthFailure("USER_NOT_FOUND", 404);
  return { person, isSelf: person.id === actorId };
}

export async function guardAccessChange(transaction: RequestDatabase, actorId: string,
  person: typeof people.$inferSelect, role: "ADMIN" | "STAFF", status: string) {
  if (person.id === actorId && (role !== person.role || status !== person.status)) {
    throw new AuthFailure("CANNOT_CHANGE_SELF", 409);
  }
  if (person.role === "ADMIN" && person.status === "ACTIVE" && (role !== "ADMIN" || status !== "ACTIVE")) {
    const [result] = await transaction.select({ total: count() }).from(people).where(and(
      eq(people.role, "ADMIN"), eq(people.status, "ACTIVE"), isNull(people.deletedAt)));
    if ((result?.total ?? 0) <= 1) throw new AuthFailure("LAST_ADMIN", 409);
  }
}

export async function loadFlow(id: string, flowId?: string) {
  return withAdminDatabase(async (transaction) => {
    const [flow] = await transaction.select().from(userVerificationFlows).where(and(
      eq(userVerificationFlows.personId, id), isNull(userVerificationFlows.deletedAt),
      flowId ? eq(userVerificationFlows.id, flowId) : undefined,
    )).orderBy(desc(userVerificationFlows.createdAt)).limit(1);
    if (!flow) throw new AuthFailure("FLOW_EXPIRED", 409);
    return flow;
  });
}
