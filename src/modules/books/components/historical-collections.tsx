"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { booksRequest } from "@/modules/books/books.client";
import { historicalCollectionsResponseSchema } from "@/modules/books/historical-collections.schema";
import { displayMoney } from "@/modules/books/returns.schema";

export function HistoricalCollections({ accountId, search, collectorId = "", bookType = "ALL", editionId = "" }: {
  accountId: string; search: string; collectorId?: string; bookType?: "ALL" | "REGULAR" | "TOKEN"; editionId?: string;
}) {
  const { language } = useLanguage(); const ur = language === "ur"; const cache = usePageDataCache();
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const params = new URLSearchParams({ search: search.trim(), collectorId, bookType, editionId, page: String(page) }).toString();
  const load = useCallback(async () => historicalCollectionsResponseSchema.parse(
    await booksRequest(`/api/v1/book-returns/history?${params}`)), [params]);
  const query = usePageQuery(`${accountId}:historical-collections:all-v2:${params}`, load, { enabled: open, delay: search ? 400 : 0 });
  const result = query.data;
  const money = (value: number | null) => value === null ? "N/A" : displayMoney(value, language);
  const labels = ur ? ["اصل قطار", "فنڈ ریزر", "کتاب · ایڈیشن", "رسیدوں کی حد", "تاریخ", "علاقہ", "حالت", "جمع شدہ رقم", "کمیشن"]
    : ["Excel row", "Fundraiser", "Book · Edition", "Receipt range", "Date", "Area", "Condition", "Collected", "Commission"];
  return <Card className="mb-5 overflow-hidden">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex w-full items-center justify-between gap-3 bg-accent/20 px-4 py-3 text-start text-sm font-semibold text-primary">
      {ur ? "تاریخی وصولیوں کا ریکارڈ" : "Historical collection records"}
      <ChevronDown size={17} className={open ? "rotate-180" : ""} aria-hidden="true" />
    </button>
    {open && <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs">
        <p className="max-w-2xl text-muted-foreground">{ur
          ? "Excel کی تمام تاریخی قطاریں یہاں ہیں۔ صفر اصل قدر ہے؛ نامعلوم معلومات N/A ہیں۔ رسید کھولنے کا اختیار صرف منسلک کتابوں پر ہے۔"
          : "All historical Excel rows. Recorded zeros stay zero; missing details show N/A. Open submission is available only for existing linked submissions. Search and book filters above apply here."}</p>
        {result && <div className="flex gap-5 tabular-nums"><span>{labels[7]}: <strong>{money(result.meta.collectedPaise)}</strong></span>
          <span>{labels[8]}: <strong>{money(result.meta.commissionPaise)}</strong></span></div>}
      </div>
      {query.error != null && <p role="alert" className="px-4 pb-4 text-xs text-[var(--danger)]">{ur ? "تاریخی ریکارڈ لوڈ نہیں ہو سکے۔ درآمد کی نئی SQL فائل چلائیں۔" : "Historical records could not load. Apply the new historical-import SQL file."}</p>}
      {!result && query.loading ? <div className="space-y-3 p-4" role="status" aria-label={ur ? "لوڈ ہو رہا ہے" : "Loading historical records"}>
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}
      </div> : result && <>
        <div className="overflow-x-auto"><table className="w-full text-start text-xs [&_th]:whitespace-nowrap [&_th]:bg-muted/50 [&_th]:p-3 [&_th]:text-start [&_th]:font-medium [&_td]:border-t [&_td]:border-border [&_td]:p-3">
          <thead><tr>{labels.map((label) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{result.data.map((row) => <tr key={row.sourceRow}>
            <td className="tabular-nums">{row.sourceRow}</td><td><strong>{row.fundraiser}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{row.code}</span></td>
            <td><strong>{row.book}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{row.edition} · {row.bookType === "TOKEN" ? `${money(row.tokenValuePaise)} ${ur ? "ٹوکن" : "Token"}` : row.bookType === "REGULAR" ? ur ? "عام" : "Regular" : "N/A"}</span>
              {row.book !== row.originalBook && <span className="mt-1 block text-[10px] text-muted-foreground">Excel: {row.originalBook}</span>}</td>
            <td className="whitespace-nowrap tabular-nums" dir="ltr">{row.receiptFrom !== null && row.receiptTo !== null ? `${row.receiptFrom}–${row.receiptTo}` : "N/A"}</td>
            <td className="whitespace-nowrap" dir="ltr">{row.date ?? "N/A"}</td><td>{row.area || "N/A"}</td><td>{row.condition}
              {row.returnId ? <Link className="mt-1 block whitespace-nowrap text-[10px] font-semibold text-primary hover:underline" href={`/receipt-entry/${row.returnId}`}
                onClick={() => { if (row.receiptNumber !== null) cache.write(`${accountId}:receipts:book:${row.returnId}:resume-number`, row.receiptNumber); }}>
                {ur ? "جمع شدہ کتاب کھولیں" : "Open submission"}</Link>
                : <span className="mt-1 block text-[10px] text-muted-foreground">{ur ? "تاریخی ریکارڈ" : "Recorded history"}</span>}</td>
            <td className="whitespace-nowrap font-semibold tabular-nums text-primary">{money(row.collectedPaise)}</td>
            <td className="whitespace-nowrap tabular-nums">{money(row.commissionPaise)}</td>
          </tr>)}{result.data.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground">{ur ? "کوئی ریکارڈ نہیں ملا" : "No historical records match these filters."}</td></tr>}</tbody>
        </table></div>
        <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs text-muted-foreground">
          <span>{result.meta.total} {ur ? "ریکارڈ" : "records"} · {result.meta.page}/{Math.max(1, Math.ceil(result.meta.total / 20))}</span>
          <div className="flex gap-2"><Button size="small" variant="outline" disabled={query.loading || result.meta.page <= 1} onClick={() => setPage(result.meta.page - 1)}>{ur ? "پچھلا" : "Previous"}</Button>
            <Button size="small" variant="outline" disabled={query.loading || result.meta.page * 20 >= result.meta.total} onClick={() => setPage(result.meta.page + 1)}>{ur ? "اگلا" : "Next"}</Button></div>
        </div>
      </>}
    </div>}
  </Card>;
}
