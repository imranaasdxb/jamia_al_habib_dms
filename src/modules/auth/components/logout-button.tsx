"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { usePageDataCache } from "@/components/page-data-provider";

export function LogoutButton() {
  const { t } = useLanguage();
  const cache = usePageDataCache();
  const [isPending, setIsPending] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function logout() {
    if (isPending) return;
    setIsPending(true);
    setHasError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setHasError(true);
        setIsPending(false);
        return;
      }
      cache.clear();
      window.location.replace("/login");
    } catch {
      setHasError(true);
      setIsPending(false);
    }
  }

  return <div className="w-full">
    <Button variant="outline" loading={isPending} onClick={logout}
      className="w-full rounded-xl border-border text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-soft)]">
      <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />{t(isPending ? "working" : "logout")}
    </Button>
    {hasError && <p className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t("authActionFailed")}</p>}
  </div>;
}
