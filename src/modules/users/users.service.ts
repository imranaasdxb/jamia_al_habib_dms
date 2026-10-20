import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@/lib/auth/server";
import { getServerEnvironment } from "@/lib/env";
import { activityLog, people, userVerificationFlows } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import { consumeAuthRateLimit } from "@/modules/auth/auth.repository";
import { createUserDraft, guardAccessChange,
  profileColumns, requireEditableTarget, withAdminDatabase } from "@/modules/users/users.repository";
import { userProfileSchema } from "@/modules/users/users.schema";
import type { CreateUserValues, UserProfileValues } from "@/modules/users/users.schema";

const providerUser = z.object({ id: z.uuid(), email: z.email(), emailVerified: z.boolean() });
const providerUserResponse = z.object({ user: providerUser });

function changedFailure(error: unknown) {
  const failure = error instanceof AuthFailure ? error : new AuthFailure("AUTH_UNAVAILABLE", 503);
  return Object.assign(failure, { dataChanged: true });
}

function requireProviderSuccess(error: unknown) {
  if (!error) return;
  const parsed = z.object({ status: z.number().optional(), code: z.string().optional() }).safeParse(error);
  if (parsed.success && (parsed.data.status === 401 || parsed.data.status === 403)) {
    throw new AuthFailure("NEON_ADMIN_REQUIRED", 403);
  }
  if (parsed.success && parsed.data.code?.includes("EXISTS")) throw new AuthFailure("USER_EXISTS", 409);
  throw new AuthFailure("AUTH_UNAVAILABLE", 503);
}

// Verification must not replace the administrator's browser session with the new user's session.
async function isolatedOtp(path: "send-verification-otp" | "verify-email", body: Record<string, string>, origin: string) {
  const response = await fetch(`${getServerEnvironment().NEON_AUTH_BASE_URL.replace(/\/$/, "")}/email-otp/${path}`, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  // Deliberately discard every upstream Set-Cookie and session token.
  if (!response.ok) throw new AuthFailure(response.status === 429 ? "RATE_LIMITED" : "OTP_INVALID", response.status === 429 ? 429 : 400);
  return payload;
}

const flowResult = (flow: typeof userVerificationFlows.$inferSelect) => ({
  personId: flow.personId, flowId: flow.id, email: flow.targetEmail, needsVerification: flow.state !== "COMPLETE",
  proofComplete: flow.state === "VERIFIED" || flow.state === "COMPLETE",
});

export async function startOnboarding(values: CreateUserValues, origin: string, existingId?: string) {
  const { password, confirmPassword: _confirmation, ...details } = values;
  void _confirmation;
  const { person, flow } = await createUserDraft(details, existingId);
  try {
  const result = await getAuth().admin.createUser({ email: details.email, name: details.fullName,
    password, role: "user", data: { emailVerified: false } });
  requireProviderSuccess(result.error);
  const identity = providerUserResponse.parse(result.data).user;
  if (identity.email.toLowerCase() !== details.email) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
  return await resendUserOtp(person.id, flow.id, origin, identity.id);
  } catch (error) { throw changedFailure(error); }
}

async function claimFlow(personId: string, flowId: string, mode: "send" | "verify", authUserId?: string) {
  return withAdminDatabase(async (transaction, actorId) => {
    const { person } = await requireEditableTarget(transaction, actorId, personId);
    const [flow] = await transaction.select().from(userVerificationFlows).where(and(
      eq(userVerificationFlows.id, flowId), eq(userVerificationFlows.personId, personId),
      isNull(userVerificationFlows.deletedAt))).for("update");
    if (!flow || (mode === "send" && flow.state === "COMPLETE")) {
      throw new AuthFailure("FLOW_EXPIRED", 409);
    }
    if (authUserId) {
      if (person.authUserId && person.authUserId !== authUserId) throw new AuthFailure("ACCESS_DENIED");
      await transaction.update(people).set({ authUserId, updatedBy: actorId, updatedAt: new Date() })
        .where(and(eq(people.id, personId), isNull(people.authUserId)));
      person.authUserId = authUserId;
    }
    if (!person.authUserId) throw new AuthFailure("FLOW_EXPIRED", 409);
    if (mode === "verify" && (flow.state === "COMPLETE" || flow.state === "VERIFIED")) return { flow, person };
    if (mode === "verify" && flow.actorId !== actorId) throw new AuthFailure("FLOW_EXPIRED", 409);
    if (flow.busyUntil && flow.busyUntil.getTime() > Date.now()) throw new AuthFailure("FLOW_BUSY", 409);
    if (mode === "send" && flow.sentAt && Date.now() - flow.sentAt.getTime() < 60000) {
      throw new AuthFailure("RATE_LIMITED", 429);
    }
    if (mode === "verify" && (flow.state !== "CODE_SENT" || flow.attempts >= 5
      || flow.expiresAt.getTime() <= Date.now())) throw new AuthFailure("FLOW_EXPIRED", 409);
    const operationId = randomUUID();
    const [claimed] = await transaction.update(userVerificationFlows).set({ operationId, actorId,
      busyUntil: new Date(Date.now() + 60000), updatedAt: new Date(), updatedBy: actorId,
      ...(mode === "send" ? { state: "PREPARING" as const, attempts: 0, sentAt: new Date(),
        expiresAt: new Date(Date.now() + 600000) } : { attempts: flow.attempts + 1 }),
    }).where(eq(userVerificationFlows.id, flow.id)).returning();
    if (!claimed) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
    return { flow: claimed, person };
  }, true);
}

async function releaseFlow(flowId: string, operationId: string | null) {
  if (!operationId) return;
  await withAdminDatabase(async (transaction) => {
    await transaction.update(userVerificationFlows).set({ busyUntil: null, operationId: null })
      .where(and(eq(userVerificationFlows.id, flowId), eq(userVerificationFlows.operationId, operationId)));
  }, true);
}

export async function resendUserOtp(personId: string, flowId: string, origin: string, authUserId?: string) {
  const { flow, person } = await claimFlow(personId, flowId, "send", authUserId);
  let released = false;
  try {
  const providerId = person.authUserId;
  if (flow.state === "COMPLETE" || !providerId) throw new AuthFailure("FLOW_EXPIRED", 409);
  if (!await consumeAuthRateLimit("admin-send-otp", flow.targetEmail, `admin:${flow.actorId}`)) {
    throw new AuthFailure("RATE_LIMITED", 429);
  }
  // On an email edit, change the provider address as unverified. The app remains pending until proof arrives.
  if (flow.purpose === "EMAIL_CHANGE") {
    const changed = await getAuth().admin.updateUser({ userId: providerId,
      data: { email: flow.targetEmail, emailVerified: false } });
    requireProviderSuccess(changed.error);
    const revoked = await getAuth().admin.revokeUserSessions({ userId: providerId });
    requireProviderSuccess(revoked.error);
  }
  await isolatedOtp("send-verification-otp", { email: flow.targetEmail, type: "email-verification" }, origin);
  await withAdminDatabase(async (transaction, actorId) => {
    await transaction.update(userVerificationFlows).set({ state: "CODE_SENT", busyUntil: null, operationId: null,
      updatedAt: new Date(), updatedBy: actorId })
      .where(and(eq(userVerificationFlows.id, flow.id), eq(userVerificationFlows.operationId, flow.operationId ?? "00000000-0000-0000-0000-000000000000")));
    await transaction.insert(activityLog).values({ actorId, action: "USER_OTP_SENT",
      resource: "people", recordId: personId, createdBy: actorId });
  }, true);
  released = true;
  return flowResult({ ...flow, state: "CODE_SENT" });
  } finally { if (!released) await releaseFlow(flow.id, flow.operationId); }
}

export async function verifyUserOtp(personId: string, flowId: string, otp: string, origin: string) {
  const { flow, person } = await claimFlow(personId, flowId, "verify");
  const providerId = person.authUserId;
  if (flow.state === "COMPLETE") return flowResult(flow);
  if (!providerId || (flow.state !== "CODE_SENT" && flow.state !== "VERIFIED")) {
    throw new AuthFailure("FLOW_EXPIRED", 409);
  }
  if (flow.state !== "VERIFIED") {
    let released = false;
    try {
    let verified = false;
    try {
      const payload = providerUserResponse.safeParse(await isolatedOtp("verify-email", { email: flow.targetEmail, otp }, origin));
      verified = payload.success && payload.data.user.id === providerId
        && payload.data.user.email.toLowerCase() === flow.targetEmail && payload.data.user.emailVerified;
    } catch (error) {
      // Recover safely when the provider consumed a code but a previous response/DB write was lost.
      const result = await getAuth().admin.listUsers({ query: { filterField: "id", filterValue: providerId,
        filterOperator: "eq", limit: 1 } });
      requireProviderSuccess(result.error);
      const payload = z.object({ users: z.array(providerUser) }).safeParse(result.data);
      const user = payload.success ? payload.data.users[0] : undefined;
      verified = Boolean(user && user.id === providerId && user.email.toLowerCase() === flow.targetEmail && user.emailVerified);
      if (!verified) throw error;
    }
    if (!verified) throw new AuthFailure("OTP_INVALID", 400);
    await withAdminDatabase(async (transaction, actorId) => {
      await transaction.update(userVerificationFlows).set({ state: "VERIFIED", verifiedAt: new Date(),
        busyUntil: null, operationId: null,
        updatedAt: new Date(), updatedBy: actorId }).where(and(eq(userVerificationFlows.id, flow.id),
          eq(userVerificationFlows.operationId, flow.operationId ?? "00000000-0000-0000-0000-000000000000")));
    }, true);
    released = true;
    } finally { if (!released) await releaseFlow(flow.id, flow.operationId); }
  }
  const details = userProfileSchema.parse(flow.details);
  try {
  await withAdminDatabase(async (transaction, actorId) => {
    const { person: current } = await requireEditableTarget(transaction, actorId, personId);
    const [fresh] = await transaction.select().from(userVerificationFlows)
      .where(eq(userVerificationFlows.id, flow.id)).for("update");
    if (!fresh || fresh.state === "COMPLETE") return;
    if (fresh.state !== "VERIFIED" || current.authUserId !== providerId) {
      throw new AuthFailure("FLOW_EXPIRED", 409);
    }
    if (fresh.actorId !== actorId) await transaction.update(userVerificationFlows).set({ actorId, updatedBy: actorId })
      .where(eq(userVerificationFlows.id, flow.id));
    if (flow.purpose === "ONBOARD" ? details.role === "ADMIN"
      : details.role !== current.role || details.fullName !== current.fullName) {
      const metadata = await getAuth().admin.updateUser({ userId: providerId,
        data: { name: details.fullName, role: details.role === "ADMIN" ? "admin" : "user" } });
      requireProviderSuccess(metadata.error);
    }
    await transaction.update(people).set({ ...profileColumns(details),
      status: current.status === "BLOCKED" ? "BLOCKED" : flow.priorStatus,
      updatedAt: new Date(), updatedBy: actorId }).where(eq(people.id, personId));
    await transaction.update(userVerificationFlows).set({ state: "COMPLETE", updatedAt: new Date(), updatedBy: actorId })
      .where(eq(userVerificationFlows.id, flow.id));
    await transaction.insert(activityLog).values({ actorId,
      action: flow.purpose === "PROFILE_CHANGE" ? "USER_PROFILE_UPDATED" : "USER_EMAIL_VERIFIED",
      resource: "people", recordId: personId, createdBy: actorId });
  }, true);
  } catch (error) { throw flow.state === "VERIFIED" ? error : changedFailure(error); }
  return flowResult({ ...flow, state: "COMPLETE" });
}

export async function saveUserProfile(id: string, values: UserProfileValues, version: string, origin: string) {
  const result = await withAdminDatabase(async (transaction, actorId) => {
    const { person, isSelf } = await requireEditableTarget(transaction, actorId, id);
    if (person.updatedAt.toISOString() !== version) throw new AuthFailure("STALE_USER", 409);
    const [openFlow] = await transaction.select({ id: userVerificationFlows.id }).from(userVerificationFlows)
      .where(and(eq(userVerificationFlows.personId, id), ne(userVerificationFlows.state, "COMPLETE"),
        isNull(userVerificationFlows.deletedAt))).limit(1);
    if (openFlow) throw new AuthFailure("VERIFICATION_PENDING", 409);
    const emailChanged = values.email !== person.email;
    if (isSelf && emailChanged) throw new AuthFailure("CANNOT_CHANGE_SELF", 409);
    if (!person.authUserId) throw new AuthFailure("VERIFICATION_PENDING", 409);
    await guardAccessChange(transaction, actorId, person, values.role, emailChanged ? "PENDING" : person.status);
    const roleChanged = values.role !== person.role;
    if (emailChanged || roleChanged) {
      const [duplicate] = await transaction.select({ id: people.id }).from(people)
        .where(and(eq(people.email, values.email), ne(people.id, id))).limit(1);
      if (duplicate) throw new AuthFailure("USER_EXISTS", 409);
      const [flow] = await transaction.insert(userVerificationFlows).values({ personId: id, actorId,
        targetEmail: values.email, purpose: emailChanged ? "EMAIL_CHANGE" : "PROFILE_CHANGE", details: { ...values },
        priorStatus: person.status === "BLOCKED" ? "BLOCKED" : person.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        expiresAt: new Date(Date.now() + 600000), createdBy: actorId,
        ...(emailChanged ? {} : { state: "VERIFIED" as const, verifiedAt: new Date() }),
      }).returning();
      if (!flow) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
      await transaction.update(people).set({ status: person.status === "BLOCKED" ? "BLOCKED" : "PENDING",
        updatedBy: actorId, updatedAt: new Date() }).where(eq(people.id, id));
      return { flow, authUserId: person.authUserId };
    }
    if (values.fullName !== person.fullName) {
      const metadata = await getAuth().admin.updateUser({ userId: person.authUserId, data: { name: values.fullName } });
      requireProviderSuccess(metadata.error);
    }
    await transaction.update(people).set({ ...profileColumns(values), updatedBy: actorId, updatedAt: new Date() })
      .where(eq(people.id, id));
    return { flow: null, authUserId: person.authUserId };
  }, true);
  try {
    if (result.flow?.purpose === "PROFILE_CHANGE") return await verifyUserOtp(id, result.flow.id, "000000", origin);
    if (result.flow) return await resendUserOtp(id, result.flow.id, origin);
  } catch (error) { throw changedFailure(error); }
  return { personId: id, flowId: "", email: values.email, needsVerification: false, proofComplete: true };
}

export async function blockUser(id: string, blocked: boolean) {
  const providerError = await withAdminDatabase(async (transaction, actorId) => {
    const { person: current } = await requireEditableTarget(transaction, actorId, id);
    if (current.id === actorId) throw new AuthFailure("CANNOT_CHANGE_SELF", 409);
    await guardAccessChange(transaction, actorId, current, current.role === "ADMIN" ? "ADMIN" : "STAFF", blocked ? "BLOCKED" : "ACTIVE");
    const [flow] = await transaction.select({ id: userVerificationFlows.id }).from(userVerificationFlows)
      .where(and(eq(userVerificationFlows.personId, id), ne(userVerificationFlows.state, "COMPLETE"),
        isNull(userVerificationFlows.deletedAt))).limit(1);
    if (!blocked && (!current.authUserId || flow)) throw new AuthFailure("VERIFICATION_PENDING", 409);
    if (!blocked && current.authUserId) {
      const result = await getAuth().admin.unbanUser({ userId: current.authUserId });
      requireProviderSuccess(result.error);
    }
    await transaction.update(people).set({ status: blocked ? "BLOCKED" : "ACTIVE",
      updatedBy: actorId, updatedAt: new Date() }).where(eq(people.id, id));
    if (blocked && current.authUserId) {
      try {
        const result = await getAuth().admin.banUser({ userId: current.authUserId,
          banReason: "Blocked by institution administrator" });
        requireProviderSuccess(result.error);
      } catch (error) {
        // Commit the app block even when the provider is down. Retry synchronizes the provider ban.
        return error instanceof AuthFailure ? error : new AuthFailure("AUTH_UNAVAILABLE", 503);
      }
    }
    return null;
  }, true);
  if (providerError) throw changedFailure(providerError);
  return { personId: id };
}
