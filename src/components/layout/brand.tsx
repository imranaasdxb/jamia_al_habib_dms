"use client";

import { Landmark } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  const { t } = useLanguage();

  return (
    <div className={cn("brand flex items-center gap-[12px] text-[color:var(--primary-hover)] [&_strong]:block [&_strong]:text-[length:18px] [&_strong]:tracking-[-.6px] [&_span]:block [&_span]:mt-[3px] [&_span]:text-[length:11px] [&_span]:text-[color:var(--muted-foreground)]", inverse && "brand-inverse text-[color:var(--primary-foreground)] [&_span]:text-[color:var(--primary-foreground)]")}>
      <Landmark size={37} strokeWidth={1.6} aria-hidden="true" />
      <div>
        <strong>{t("institution")}</strong>
        <span>{t("donationManagement")}</span>
      </div>
    </div>
  );
}
