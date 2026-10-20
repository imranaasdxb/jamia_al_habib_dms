import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AUTH_FLOW_COOKIE, decodeAuthFlow } from "@/lib/auth/flow-cookie";
import { AuthScreen } from "@/modules/auth/components/auth-screen";

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ purpose: string }>;
}) {
  const { purpose } = await params;
  if (purpose !== "signup" && purpose !== "reset") notFound();
  const flow = decodeAuthFlow((await cookies()).get(AUTH_FLOW_COOKIE)?.value);
  if (!flow || flow.purpose !== purpose) redirect("/login?notice=expired");
  return <AuthScreen screen={purpose === "signup" ? "verifySignup" : "verifyReset"} email={flow.email} />;
}
