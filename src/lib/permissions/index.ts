import "server-only";
import { getAuth } from "@/lib/auth/server";
import { requireAccount } from "@/lib/auth/session";
import { hasAccountPermission } from "@/modules/auth/auth.repository";
import { AuthFailure } from "@/modules/auth/auth.types";

export async function requirePermission(permission: string) {
  const account = await requireAccount();
  const { data: session } = await getAuth().getSession();
  if (!session?.user?.emailVerified) throw new AuthFailure("ACCESS_DENIED");
  const allowed = await hasAccountPermission({ id: session.user.id, email: session.user.email,
    emailVerified: session.user.emailVerified }, account, permission);
  if (!allowed) throw new AuthFailure("ACCESS_DENIED");
  return account;
}
