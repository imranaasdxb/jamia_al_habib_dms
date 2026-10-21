import { requireAccount } from "@/lib/auth/session";
import { BooksScreen } from "@/modules/books/components/books-screen";

export const dynamic = "force-dynamic";
export default async function BooksPage() { return <BooksScreen account={await requireAccount()} />; }
