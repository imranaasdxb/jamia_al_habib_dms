import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_FLOW_COOKIE, decodeAuthFlow } from "@/lib/auth/flow-cookie";
import { AuthScreen } from "@/modules/auth/components/auth-screen";

export default async function ResetPasswordPage() {
  const flow = decodeAuthFlow((await cookies()).get(AUTH_FLOW_COOKIE)?.value);
  if (!flow || flow.purpose !== "reset" || !flow.otp) redirect("/login?notice=expired");
  return <AuthScreen screen="reset" email={flow.email} />;
}
