import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { APP_SESSION_COOKIE } from "@/lib/auth/flow-cookie";
import { findActiveAccount } from "@/modules/auth/auth.repository";
import { AuthFailure } from "@/modules/auth/auth.types";

export async function getAccountContext(_touch = false) {
  const token = (await cookies()).get(APP_SESSION_COOKIE)?.value;
  if (!token) return null;
  const { data: session, error } = await getAuth().getSession();
  if (error || !session?.user?.emailVerified) return null;
  const identity = { id: session.user.id, email: session.user.email,
    emailVerified: session.user.emailVerified };
  const account = await findActiveAccount(identity, token);
  return account ? { account, identity } : null;
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
