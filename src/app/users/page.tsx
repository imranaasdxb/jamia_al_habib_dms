import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/session";
import { UsersScreen } from "@/modules/users/components/users-screen";
import "@/modules/users/components/users.css";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const account = await requireAccount();
  if (account.role !== "ADMIN") redirect("/dashboard");
  return <UsersScreen account={account} />;
}
