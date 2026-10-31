import { DashboardScreen } from "@/modules/dashboard/components/dashboard-screen";
import { requirePermission } from "@/lib/permissions";
import { Suspense } from "react";
import { readDashboard } from "@/modules/dashboard/dashboard.repository";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { Account } from "@/modules/auth/auth.types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const account = await requirePermission("dashboard.read");
  return <Suspense fallback={<DashboardScreen account={account} initializing />}>
    <DashboardWithData account={account} />
  </Suspense>;
}

async function DashboardWithData({ account }: { account: Account }) {
  try {
    const data = await readDashboard({ period: "allTime", interval: "yearly" });
    return <DashboardScreen account={account} initialData={data} />;
  } catch (error) {
    return <DashboardScreen account={account} initialError={error instanceof AuthFailure ? error.code : "DASHBOARD_UNAVAILABLE"} />;
  }
}
