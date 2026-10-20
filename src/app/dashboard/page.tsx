import { DashboardScreen } from "@/modules/dashboard/components/dashboard-screen";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const account = await requirePermission("dashboard.read");
  return <DashboardScreen account={account} />;
}
