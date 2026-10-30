"use client";

import { useCallback } from "react";
import { BookOpen, RefreshCw, Ticket, Wallet } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { editionCollectionTotalsResponseSchema } from "@/modules/books/edition-totals.schema";
import { displayMoney } from "@/modules/books/returns.schema";
import type { EditionCollectionTotals } from "@/modules/books/edition-totals.schema";

const groups = [
  { key: "total", label: "editionTotalsAll", Icon: Wallet },
  { key: "regular", label: "editionTotalsRegular", Icon: BookOpen },
  { key: "token", label: "editionTotalsToken", Icon: Ticket },
] as const;

function reconcile(previous: EditionCollectionTotals | undefined, next: EditionCollectionTotals) {
  return previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

export function EditionTotalsCards({ accountId }: { accountId: string }) {
  const { t, language } = useLanguage();
  const cache = usePageDataCache();
  const key = `${accountId}:edition-summary:totals`;
  const load = useCallback(async () => editionCollectionTotalsResponseSchema.parse(
    await booksRequest("/api/v1/books/editions/totals"),
  ).data, []);
  const query = usePageQuery(key, load, { reconcile });
  const pending = !query.data && query.error == null;

  return <div className="min-w-0 flex-1 basis-[620px]" aria-label={t("editionTotals")}>
    <div className="grid gap-3 sm:grid-cols-3" aria-busy={pending}>
      {groups.map(({ key: group, label, Icon }) => {
        const featured = group === "total";
        const regular = group === "regular";
        const values = query.data?.[group];
        return <Card key={group} className={`relative isolate min-w-0 overflow-hidden rounded-2xl p-4 ${featured
          ? "border-emerald-700 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-600 text-white shadow-md shadow-emerald-900/10"
          : regular ? "border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/70 text-sky-950 shadow-sm"
          : "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100/70 text-amber-950 shadow-sm"}`}>
          {featured && <div aria-hidden="true" className="pointer-events-none absolute -end-8 -top-12 -z-10 size-36 rounded-full border-[18px] border-white/5" />}
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-xs font-semibold ${featured ? "text-emerald-50" : regular ? "text-sky-950" : "text-amber-950"}`}>{t(label)}</h3>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${featured ? "bg-white/15" : regular ? "bg-sky-200/60 text-sky-700" : "bg-amber-200/60 text-amber-800"}`}><Icon size={16} aria-hidden="true" /></span>
          </div>
          <p className={`mt-2 text-[10px] ${featured ? "text-emerald-100" : regular ? "text-sky-700" : "text-amber-800"}`}>{t("editionSummaryCollected")}</p>
          {pending ? <div className={`mt-2 h-7 w-3/4 animate-pulse rounded-md ${featured ? "bg-white/20" : "bg-muted"}`} />
            : <strong className={`mt-1 block break-words text-[24px] font-bold leading-tight tracking-tight tabular-nums ${featured ? "text-white" : regular ? "text-sky-950" : "text-amber-950"}`}>
              {values ? displayMoney(values.collectedPaise, language) : "—"}</strong>}
          <div className={`mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t pt-2.5 text-[11px] ${featured ? "border-white/15 text-emerald-100" : regular ? "border-sky-200 text-sky-700" : "border-amber-200 text-amber-800"}`}>
            <span>{t("editionTotalsCommission")}</span>
            {pending ? <span className={`h-4 w-16 animate-pulse rounded ${featured ? "bg-white/20" : "bg-muted"}`} />
              : <b className={`tabular-nums ${featured ? "text-white" : regular ? "text-sky-900" : "text-amber-900"}`}>{values ? displayMoney(values.commissionPaise, language) : "—"}</b>}
          </div>
        </Card>;
      })}
    </div>
    {query.error != null && <div role="alert" className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
      <span>{t(booksError(query.error))}</span><Button variant="ghost" size="small" loading={query.loading}
        onClick={() => cache.invalidate(key)}><RefreshCw size={14} aria-hidden="true" />{t("usersRefresh")}</Button>
    </div>}
  </div>;
}
