import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/session";
import { MastersScreen } from "@/modules/masters/components/masters-screen";
import "@/modules/masters/components/masters.css";

export const dynamic = "force-dynamic";
export default async function MastersPage() {
  const account = await requireAccount();
  if (account.role !== "ADMIN") redirect("/dashboard");
  return <MastersScreen account={account} />;
}
