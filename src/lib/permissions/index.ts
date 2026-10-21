import "server-only";
import { requireAccountContext } from "@/lib/auth/session";
import { hasAccountPermission } from "@/modules/auth/auth.repository";
import { AuthFailure } from "@/modules/auth/auth.types";

export async function requirePermission(permission: string) {
  const { account, identity } = await requireAccountContext();
  if (account.role === "ADMIN") return account;
  const allowed = await hasAccountPermission(identity, account, permission);
  if (!allowed) throw new AuthFailure("ACCESS_DENIED");
  return account;
}
