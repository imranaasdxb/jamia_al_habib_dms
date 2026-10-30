import { requireAccount } from "@/lib/auth/session";
import { DonorsScreen } from "@/modules/donors/components/donors-screen";

export const dynamic = "force-dynamic";
export default async function DonorsPage() { return <DonorsScreen account={await requireAccount()} />; }
