import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth/session";
import { LeftoversScreen } from "@/modules/books/components/leftovers-screen";

export const dynamic = "force-dynamic";
export default async function LeftoverBooksPage() {
  const account = await requireAccount();
  if (account.role !== "ADMIN") redirect("/books");
  return <LeftoversScreen account={account} />;
}
