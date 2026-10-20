import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/session";
import { SettingsScreen } from "@/modules/settings/components/settings-screen";
import "@/modules/settings/components/settings.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const account = await requireAccount();
  if (account.role !== "ADMIN") redirect("/dashboard");
  return <SettingsScreen account={account} />;
}
