"use client";

import { Landmark } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  const { t } = useLanguage();

  return (
    <div className={cn("brand", inverse && "brand-inverse")}>
      <Landmark size={37} strokeWidth={1.6} aria-hidden="true" />
      <div>
        <strong>{t("institution")}</strong>
        <span>{t("donationManagement")}</span>
      </div>
    </div>
  );
}
