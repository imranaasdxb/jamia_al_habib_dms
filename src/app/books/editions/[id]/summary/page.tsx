import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";
import { EditionSummaryScreen } from "@/modules/books/components/edition-summary-screen";

export const dynamic = "force-dynamic";
export default async function EditionSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccount();
  if (account.role !== "SUPER_ADMIN") redirect("/dashboard");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <EditionSummaryScreen key={id.data} account={account} editionId={id.data} />;
}
