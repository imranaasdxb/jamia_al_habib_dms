import { z } from "zod";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/auth/session";
import { ReceiptBookScreen } from "@/modules/receipts/components/receipts-screen";
export const dynamic = "force-dynamic";
export default async function ReceiptBookPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id); if (!id.success) notFound();
  return <ReceiptBookScreen account={await requireAccount()} returnId={id.data} />;
}
