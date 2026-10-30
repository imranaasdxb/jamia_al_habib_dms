import { requireAccount } from "@/lib/auth/session";
import { ReportsScreen } from "@/modules/reports/components/reports-screen";
export const dynamic="force-dynamic";
export default async function ReportsPage(){return <ReportsScreen account={await requireAccount()}/>;}
