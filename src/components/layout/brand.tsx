"use client";

import { Landmark } from "lucide-react";
import Image from "next/image";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

export function Brand({ inverse = false, logo = false }: { inverse?: boolean; logo?: boolean }) {
  const { t } = useLanguage();

  return (
    <div className={cn("brand flex items-center gap-[12px] text-[color:var(--primary-hover)] [&_strong]:block [&_strong]:text-[length:18px] [&_strong]:tracking-[-.6px] [&_span]:block [&_span]:mt-[3px] [&_span]:text-[length:11px] [&_span]:text-[color:var(--muted-foreground)]", inverse && "brand-inverse text-[color:var(--primary-foreground)] [&_span]:text-[color:var(--primary-foreground)]")}>
      {logo ? <picture className="block h-11 w-10 shrink-0 overflow-hidden">
        <Image src="/images/authorization-certificate-logo.png" alt={t("institution")} width={40} height={44} sizes="40px"
          loading="eager" className="h-full w-full scale-[1.33] object-cover object-center" />
      </picture> : <Landmark size={37} strokeWidth={1.6} aria-hidden="true" />}
      <div>
        <strong>{t("institution")}</strong>
        <span>{t("donationManagement")}</span>
      </div>
    </div>
  );
}
