import { requireAccount } from "@/lib/auth/session";
import { DonationsScreen } from "@/modules/donations/components/donations-screen";
export const dynamic="force-dynamic";
export default async function DonationsPage(){return <DonationsScreen account={await requireAccount()}/>;}
