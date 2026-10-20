import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withRequestDatabase } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { readProfilePhoto, removeProfilePhoto, uploadProfilePhoto } from "@/lib/storage/profile-photos";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { getManagedUser, getUsersAccount, requireEditableTarget, withAdminDatabase,
  withUsersRequest } from "@/modules/users/users.repository";
import { boundedBody, userFailure, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
interface Context { params: Promise<{ id: string }> }
async function personId(context: Context) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
  return parsed.data;
}
async function getPhoto(_request: NextRequest, context: Context) {
  try {
    const id = await personId(context);
    const account = (await getUsersAccount(false))?.account;
    if (!account) throw new AuthFailure("SESSION_EXPIRED", 401);
    if (account.role !== "ADMIN" && account.id !== id) throw new AuthFailure("ACCESS_DENIED");
    const person = account.role === "ADMIN" ? await getManagedUser(id)
      : await withRequestDatabase({ email: account.email }, async (transaction) => {
        const [own] = await transaction.select({ profilePhotoKey: people.profilePhotoKey })
          .from(people).where(and(eq(people.id, account.id), isNull(people.deletedAt))).limit(1);
        return own;
      });
    if (!person?.profilePhotoKey) return new Response(null, { status: 404 });
    return new Response(await readProfilePhoto(person.profilePhotoKey), { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline; filename=profile.jpg",
    } });
  } catch (error) { return userFailure(error); }
}
async function postPhoto(request: NextRequest, context: Context) {
  let key: string | null = null;
  let attached = false;
  try {
    requireSameOrigin(request);
    const id = await personId(context);
    await getManagedUser(id);
    const bytes = await boundedBody(request, 2 * 1024 * 1024 + 16384);
    const form = await new Response(bytes, { headers: {
      "Content-Type": request.headers.get("content-type") ?? "",
    } }).formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new AuthFailure("INVALID_PHOTO", 400);
    key = await uploadProfilePhoto(id, file);
    const saved = await withAdminDatabase(async (transaction, actorId) => {
      const { person } = await requireEditableTarget(transaction, actorId, id);
      const [updated] = await transaction.update(people).set({ profilePhotoKey: key, updatedBy: actorId,
        updatedAt: new Date() }).where(eq(people.id, id)).returning({ updatedAt: people.updatedAt });
      if (!updated) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
      return { oldKey: person.profilePhotoKey, updatedAt: updated.updatedAt.toISOString() };
    }, true);
    attached = true;
    if (saved.oldKey) await removeProfilePhoto(saved.oldKey).catch(() => undefined);
    return userResponse({ uploaded: true, updatedAt: saved.updatedAt });
  } catch (error) {
    if (key && !attached) await removeProfilePhoto(key).catch(() => undefined);
    return userFailure(error);
  }
}
async function deletePhoto(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const id = await personId(context);
    const saved = await withAdminDatabase(async (transaction, actorId) => {
      const { person } = await requireEditableTarget(transaction, actorId, id);
      const [updated] = await transaction.update(people).set({ profilePhotoKey: null, updatedBy: actorId,
        updatedAt: new Date() }).where(eq(people.id, id)).returning({ updatedAt: people.updatedAt });
      if (!updated) throw new AuthFailure("AUTH_UNAVAILABLE", 503);
      return { oldKey: person.profilePhotoKey, updatedAt: updated.updatedAt.toISOString() };
    }, true);
    if (saved.oldKey) await removeProfilePhoto(saved.oldKey).catch(() => undefined);
    return userResponse({ removed: true, updatedAt: saved.updatedAt });
  } catch (error) { return userFailure(error); }
}

export const GET = (request: NextRequest, context: Context) => withUsersRequest(() => getPhoto(request, context));
export const POST = (request: NextRequest, context: Context) => withUsersRequest(() => postPhoto(request, context));
export const DELETE = (request: NextRequest, context: Context) => withUsersRequest(() => deletePhoto(request, context));
