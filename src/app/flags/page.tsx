import { requireAccount } from "@/lib/auth/session";
import { ReceiptReviewScreen } from "@/modules/receipts/components/receipt-review-screen";
export const dynamic = "force-dynamic";
export default async function FlagsPage() { return <ReceiptReviewScreen account={await requireAccount()} mode="ISSUES" />; }
