"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function LogoutButton() {
  const { t } = useLanguage();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function logout() {
    setIsPending(true);
    setHasError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setHasError(true);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setIsPending(false);
    }
  }

  return <div>
    <Button variant="outline" disabled={isPending} onClick={logout}>
      <LogOut size={16} aria-hidden="true" />{t(isPending ? "working" : "logout")}
    </Button>
    {hasError && <p className="field-error" role="alert">{t("authActionFailed")}</p>}
  </div>;
}
