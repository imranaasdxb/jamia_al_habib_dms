import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getAccountContext } from "@/lib/auth/session";
import { withRequestDatabase } from "@/lib/db";
import { activityLog, appSettings, people } from "@/lib/db/schema";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { RequestDatabase } from "@/lib/db";
import type { SaveSettingsValues } from "@/modules/settings/settings.schema";

const columns = { defaultReturnMonths: appSettings.defaultReturnMonths, updatedAt: appSettings.updatedAt };
const singleton = and(eq(appSettings.slot, 1), isNull(appSettings.deletedAt));
const serialize = (row: { defaultReturnMonths: number; updatedAt: Date }) =>
  ({ ...row, updatedAt: row.updatedAt.toISOString() });

async function withSettingsAdmin<T>(operation: (transaction: RequestDatabase, actorId: string) => Promise<T>) {
  const context = await getAccountContext(true);
  if (!context) throw new AuthFailure("SESSION_EXPIRED", 401);
  if (context.account.role !== "ADMIN") throw new AuthFailure("ACCESS_DENIED");
  return withRequestDatabase({ email: context.identity.email, authUserId: context.identity.id }, async (transaction) => {
    // Recheck the current database role; a cached page never authorizes this endpoint.
    const [actor] = await transaction.select({ id: people.id }).from(people).where(and(
      eq(people.id, context.account.id), eq(people.authUserId, context.identity.id),
      eq(people.role, "ADMIN"), eq(people.status, "ACTIVE"), isNull(people.deletedAt),
    )).limit(1).for("share");
    if (!actor) throw new AuthFailure("ACCESS_DENIED");
    await transaction.execute(sql`select set_config('app.person_id', ${actor.id}, true),
      set_config('app.role', 'ADMIN', true)`);
    return operation(transaction, actor.id);
  });
}

export async function readSettings() {
  return withSettingsAdmin(async (transaction) => {
    const [settings] = await transaction.select(columns).from(appSettings).where(singleton).limit(1);
    if (!settings) throw new AuthFailure("SETTINGS_UNAVAILABLE", 503);
    return serialize(settings);
  });
}

export async function saveSettings(input: SaveSettingsValues) {
  return withSettingsAdmin(async (transaction, actorId) => {
    const [previous] = await transaction.select({ id: appSettings.id, ...columns }).from(appSettings)
      .where(singleton).limit(1).for("update");
    if (!previous) throw new AuthFailure("SETTINGS_UNAVAILABLE", 503);
    if (previous.updatedAt.toISOString() !== input.version) throw new AuthFailure("STALE_SETTINGS", 409);
    const oldValues = serialize({ defaultReturnMonths: previous.defaultReturnMonths, updatedAt: previous.updatedAt });
    if (previous.defaultReturnMonths === input.defaultReturnMonths) return oldValues;
    const [updated] = await transaction.update(appSettings).set({
      defaultReturnMonths: input.defaultReturnMonths,
      updatedAt: new Date(), updatedBy: actorId,
    }).where(eq(appSettings.id, previous.id)).returning(columns);
    if (!updated) throw new AuthFailure("SETTINGS_UNAVAILABLE", 503);
    const result = serialize(updated);
    await transaction.insert(activityLog).values({ actorId, action: "UPDATE", resource: "app_settings",
      recordId: previous.id, oldValues, newValues: result, reason: input.reason,
      createdBy: actorId, updatedBy: actorId });
    return result;
  });
}
