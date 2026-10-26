"use client";
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

export function EditionReceiptImage({ source, compact = false }: { source: string; compact?: boolean }) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false);
  useEffect(() => { setLoading(true); setFailed(false); }, [source]);
  return <div className="relative flex min-h-36 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 p-3" aria-busy={loading}>
    {loading && !failed && <div className="absolute inset-0 animate-pulse bg-muted" role="status" aria-label={t("working")} />}
    {failed ? <p role="alert" className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><ImageOff size={18} aria-hidden="true" />{t("editionReceiptLoadFailed")}</p>
      : <img src={source} alt={t("editionReceiptSample")} className={`block w-full object-contain transition-opacity ${compact ? "max-h-52" : "max-h-[55vh]"} ${loading ? "opacity-0" : "opacity-100"}`}
        onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />}
  </div>;
}
