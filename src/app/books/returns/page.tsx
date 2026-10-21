import { requireAccount } from "@/lib/auth/session";
import { ReturnsScreen } from "@/modules/books/components/returns-screen";

export const dynamic = "force-dynamic";
export default async function BookReturnsPage() { return <ReturnsScreen account={await requireAccount()} />; }
