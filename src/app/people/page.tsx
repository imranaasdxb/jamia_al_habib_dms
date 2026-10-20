import { requireAccount } from "@/lib/auth/session";
import { PeopleScreen } from "@/modules/people/components/people-screen";
import "@/modules/users/components/users.css";
import "@/modules/people/components/people.css";

export const dynamic = "force-dynamic";
export default async function PeoplePage() {
  return <PeopleScreen account={await requireAccount()} />;
}
