import { requireAccount } from "@/lib/auth/session";
import { PeopleScreen } from "@/modules/people/components/people-screen";

export const dynamic = "force-dynamic";
export default async function PeoplePage() {
  return <PeopleScreen account={await requireAccount()} />;
}
