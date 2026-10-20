import { AuthScreen } from "@/modules/auth/components/auth-screen";
import type { MessageKey } from "@/lib/i18n/messages";

const notices: Record<string, MessageKey> = {
  pending: "authPending", verified: "authEmailVerified",
  expired: "authExpired", "password-reset": "authPasswordUpdated",
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return <AuthScreen screen="login" notice={notice ? notices[notice] : undefined} />;
}
