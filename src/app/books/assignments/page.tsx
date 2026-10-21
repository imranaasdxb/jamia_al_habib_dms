import { z } from "zod";
import { requireAccount } from "@/lib/auth/session";
import { AssignmentsScreen } from "@/modules/books/components/assignments-screen";

export const dynamic = "force-dynamic";
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const initialId = z.uuid().safeParse(params.fundraiser);
  const code = typeof params.code === "string" && /^COL-\d{1,20}$/.test(params.code) ? params.code : "";
  return <AssignmentsScreen account={await requireAccount()} initialId={initialId.success ? initialId.data : ""} initialCode={code} />;
}
