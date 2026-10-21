import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getServerEnvironment } from "@/lib/env";
import { withRequestDatabase } from "@/lib/db";
import { activityLog, appSessions, appSettings, authRateLimits, bootstrapState,
  people, userPermissions } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { RequestDatabase } from "@/lib/db";
import type { Person } from "@/lib/db/schema";
import type { Account, AuthIdentity } from "@/modules/auth/auth.types";

export function hashAuthValue(value: string): string {
  return createHmac("sha256", getServerEnvironment().NEON_AUTH_COOKIE_SECRET).update(value).digest("hex");
}

async function setActor(transaction: RequestDatabase, person: Person) {
  const role = person.status === "ACTIVE" ? person.role : "";
  await transaction.execute(sql`select set_config('app.person_id', ${person.id}, true),
    set_config('app.role', ${role}, true)`);
}

async function findPerson(transaction: RequestDatabase, identity: AuthIdentity, lock = true) {
  const personQuery = transaction.select().from(people).where(and(
    eq(people.email, identity.email.toLowerCase()), isNull(people.deletedAt),
  )).limit(1);
  const [person] = lock ? await personQuery.for("update") : await personQuery;
  if (!person || person.role === "COLLECTOR"
    || (person.authUserId !== null && person.authUserId !== identity.id)) return null;

  if (person.authUserId === null) {
    if (!lock) return null;
    const [state] = await transaction.select({ firstPersonId: bootstrapState.firstPersonId })
      .from(bootstrapState).where(eq(bootstrapState.slot, 1)).limit(1);
    if (state?.firstPersonId !== person.id) return null;
    await transaction.update(people).set({ authUserId: identity.id, updatedAt: new Date() })
      .where(and(eq(people.id, person.id), isNull(people.authUserId)));
  }
  await setActor(transaction, person);
  return person;
}

export async function reserveSignup(email: string, fullName: string): Promise<boolean> {
  return withRequestDatabase({ email }, async (transaction) => {
    const [state] = await transaction.select().from(bootstrapState)
      .where(eq(bootstrapState.slot, 1)).for("update");
    if (!state) throw new AuthFailure("AUTH_UNAVAILABLE", 503);

    const [existing] = await transaction.select().from(people)
      .where(and(eq(people.email, email), isNull(people.deletedAt))).limit(1);
    if (existing) {
      return existing.authUserId === null && existing.role !== "COLLECTOR"
        && existing.id === state.firstPersonId;
    }
    if (state.firstPersonId !== null) return false;

    const [person] = await transaction.insert(people).values({ fullName, email })
      .returning({ id: people.id });
    if (!person) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
    await transaction.update(bootstrapState).set({ firstPersonId: person.id, updatedAt: new Date() })
      .where(eq(bootstrapState.id, state.id));
    return true;
  });
}

export async function bindIdentity(identity: AuthIdentity) {
  return withRequestDatabase({ email: identity.email, authUserId: identity.id },
    async (transaction) => {
      const person = await findPerson(transaction, identity);
      if (!person) throw new AuthFailure("ACCESS_DENIED");
      return person;
    });
}

export async function consumeAuthRateLimit(action: string, email: string, ip: string): Promise<boolean> {
  return withRequestDatabase({}, async (transaction) => {
    const limits = [{ key: `ip:${action}:${ip}`, maximum: 60 }];
    if (email) limits.push({ key: `email:${action}:${email.toLowerCase()}`,
      maximum: action === "login" ? 10 : 5 });
    const maximums = new Map(limits.map((limit) => [hashAuthValue(limit.key), limit.maximum]));
    const rows = await transaction.insert(authRateLimits)
        .values(Array.from(maximums.keys(), (keyHash) => ({ keyHash })))
        .onConflictDoUpdate({
          target: authRateLimits.keyHash,
          set: {
            attempts: sql`case when ${authRateLimits.windowStartedAt} < now() - interval '15 minutes'
              then 1 else ${authRateLimits.attempts} + 1 end`,
            windowStartedAt: sql`case when ${authRateLimits.windowStartedAt} < now() - interval '15 minutes'
              then now() else ${authRateLimits.windowStartedAt} end`,
            updatedAt: new Date(),
          },
        }).returning({ keyHash: authRateLimits.keyHash, attempts: authRateLimits.attempts });
    return rows.length === maximums.size
      && rows.every((row) => row.attempts <= (maximums.get(row.keyHash) ?? 0));
  });
}

function accountFromPerson(person: Person, sessionTimeoutMinutes: number): Account {
  if (person.status === "PENDING") throw new AuthFailure("ACCOUNT_PENDING");
  if (person.status !== "ACTIVE" || person.role === "COLLECTOR" || !person.email) {
    throw new AuthFailure("ACCESS_DENIED");
  }
  return { id: person.id, fullName: person.fullName, email: person.email, role: person.role,
    language: person.language, sessionTimeoutMinutes, hasPhoto: person.profilePhotoKey !== null };
}

export async function createAppSession(identity: AuthIdentity): Promise<string> {
  if (!identity.emailVerified) throw new AuthFailure("EMAIL_NOT_VERIFIED");
  return withRequestDatabase({ email: identity.email, authUserId: identity.id }, async (transaction) => {
    const person = await findPerson(transaction, identity);
    if (!person) throw new AuthFailure("ACCESS_DENIED");
    accountFromPerson(person, 30);
    const token = randomBytes(32).toString("base64url");
    await transaction.insert(appSessions).values({ personId: person.id, tokenHash: hashAuthValue(token),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), createdBy: person.id });
    await transaction.insert(activityLog).values({ actorId: person.id, action: "LOGIN",
      resource: "authentication", recordId: person.id, createdBy: person.id });
    return token;
  });
}

export async function findActiveAccount(
  identity: AuthIdentity, token: string, touch = false,
): Promise<Account | null> {
  if (!identity.emailVerified) return null;
  return withRequestDatabase({ email: identity.email, authUserId: identity.id }, async (transaction) => {
    const person = await findPerson(transaction, identity, touch);
    if (!person) return null;
    const [settings] = await transaction.select().from(appSettings).where(eq(appSettings.slot, 1));
    if (!settings) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
    const account = accountFromPerson(person, settings.sessionTimeoutMinutes);
    const sessionQuery = transaction.select().from(appSessions).where(and(
      eq(appSessions.personId, person.id), eq(appSessions.tokenHash, hashAuthValue(token)),
      isNull(appSessions.revokedAt), isNull(appSessions.deletedAt),
    )).limit(1);
    const [session] = touch ? await sessionQuery.for("update") : await sessionQuery;
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now
      || now - session.lastActivityAt.getTime() >= settings.sessionTimeoutMinutes * 60000) return null;
    if (touch) await transaction.update(appSessions).set({ lastActivityAt: new Date(),
      updatedAt: new Date(), updatedBy: person.id }).where(eq(appSessions.id, session.id));
    return account;
  });
}

export async function revokeAppSession(identity: AuthIdentity, token: string) {
  await withRequestDatabase({ email: identity.email, authUserId: identity.id }, async (transaction) => {
    const person = await findPerson(transaction, identity);
    if (!person) return;
    await transaction.update(appSessions).set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(appSessions.personId, person.id), eq(appSessions.tokenHash, hashAuthValue(token))));
    await transaction.insert(activityLog).values({ actorId: person.id, action: "LOGOUT",
      resource: "authentication", recordId: person.id, createdBy: person.id });
  });
}

export async function revokeSessionsAfterPasswordReset(email: string) {
  await withRequestDatabase({ email }, async (transaction) => {
    const [person] = await transaction.select().from(people)
      .where(and(eq(people.email, email), isNull(people.deletedAt))).limit(1);
    if (!person) return;
    await setActor(transaction, person);
    await transaction.update(appSessions).set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(appSessions.personId, person.id), isNull(appSessions.revokedAt)));
    await transaction.insert(activityLog).values({ actorId: person.id, action: "PASSWORD_RESET",
      resource: "authentication", recordId: person.id, createdBy: person.id });
  });
}

export async function hasAccountPermission(identity: AuthIdentity, account: Account, permission: string) {
  return withRequestDatabase({ email: identity.email, authUserId: identity.id }, async (transaction) => {
    const person = await findPerson(transaction, identity);
    if (!person || person.id !== account.id || person.status !== "ACTIVE") return false;
    if (person.role === "ADMIN") return true;
    const [override] = await transaction.select({ allowed: userPermissions.allowed })
      .from(userPermissions).where(and(eq(userPermissions.personId, person.id),
        eq(userPermissions.permission, permission), isNull(userPermissions.deletedAt))).limit(1);
    return override?.allowed ?? permission === "dashboard.read";
  });
}
