import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { APP_SESSION_COOKIE } from "@/lib/auth/flow-cookie";
import { findActiveAccountContext } from "@/modules/auth/auth.repository";
import { AuthFailure } from "@/modules/auth/auth.types";

// React request memoization only: account/session revocation is checked again on
// every new request, and no user's authorization is shared with another request.
const resolveAccountContext = cache(async () => {
  const token = (await cookies()).get(APP_SESSION_COOKIE)?.value;
  if (!token) return null;
  const { data: session, error } = await getAuth().getSession();
  if (error || !session?.user?.emailVerified) return null;
  const identity = { id: session.user.id, email: session.user.email,
    emailVerified: session.user.emailVerified };
  const access = await findActiveAccountContext(identity, token);
  return access ? { ...access, identity } : null;
});

export function getAccountContext(_touch = false) {
  return resolveAccountContext();
}

export async function getAccount(_touch = false) {
  return (await getAccountContext())?.account ?? null;
}

export async function requireAccountContext() {
  try {
    const context = await getAccountContext();
    if (context) return context;
  } catch (error) {
    if (!(error instanceof AuthFailure)) throw error;
    if (error.code === "ACCOUNT_PENDING") redirect("/login?notice=pending");
  }
  redirect("/login");
}

export async function requireAccount() {
  return (await requireAccountContext()).account;
}
