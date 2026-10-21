"use client";
import Link from "next/link";
import { memo, useCallback, useState } from "react";
import { BookOpen, Eye, Plus, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BookMasterSelect } from "@/modules/books/components/book-master-select";
import { BookStockForm } from "@/modules/books/components/book-stock-form";
import { booksError, booksRequest, bookStatusLabels } from "@/modules/books/books.client";
import { booksResponseSchema } from "@/modules/books/books.schema";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@/modules/auth/auth.types";
import type { BookRow, BooksPage, BooksQuery } from "@/modules/books/books.schema";
import type { MessageKey } from "@/lib/i18n/messages";

function reconcile(previous: BooksPage | undefined, next: BooksPage): BooksPage {
  const existing = new Map(previous?.rows.map((row) => [row.id, row]));
  return { ...next, rows: next.rows.map((row) => {
    const cached = existing.get(row.id);
    return cached && JSON.stringify(cached) === JSON.stringify(row) ? cached : row;
  }) };
}
const StockRow = memo(function StockRow({ row, onView }: { row: BookRow; onView: (row: BookRow) => void }) {
  const { t, language } = useLanguage();
  return <tr><td><button type="button" className={"books-number-link [border:0] p-0 bg-[transparent] text-[color:var(--primary)] [font:inherit] font-semibold cursor-pointer text-start [&:hover]:[text-decoration:underline]"} onClick={() => onView(row)}><bdi dir="ltr">{row.bookNumber}</bdi></button>
    <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"} dir="ltr">{row.stockDate}</span></td>
    <td>{language === "ur" ? row.editionNameUr : row.editionNameEn}</td>
    <td>{t(row.bookType === "TOKEN" ? "booksToken" : "booksRegular")}{row.tokenValuePaise !== null && <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{formatCurrency(row.tokenValuePaise / 100)}</span>}</td>
    <td><bdi dir="ltr">{row.receiptFrom} – {row.receiptTo}</bdi></td><td>{row.totalReceipts}</td>
    <td><Badge tone={row.status === "IN_STOCK" || row.status === "CLOSED" ? "success" : row.status === "FLAGGED" || row.status === "LOST" ? "danger" : "warning"}>{t(bookStatusLabels[row.status])}</Badge></td>
    <td><Button variant="ghost" size="icon" aria-label={t("booksView")} title={t("booksView")} onClick={() => onView(row)}><Eye size={17} /></Button></td></tr>;
});
export function BooksScreen({ account }: { account: Account }) {
  const { t, language } = useLanguage();
  const cache = usePageDataCache();
  const scope = `${account.id}:books:`;
  const [search, setSearch] = usePageState(`${scope}search`, "");
  const [editionId, setEdition] = usePageState(`${scope}edition`, "");
  const [bookType, setBookType] = usePageState<BooksQuery["bookType"]>(`${scope}type`, "ALL");
  const [tokenValue, setTokenValue] = usePageState<BooksQuery["tokenValue"]>(`${scope}token`, "");
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const [mode, setMode] = useState<"SINGLE" | "BULK" | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<BookRow | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const params = new URLSearchParams({ search: search.trim(), editionId, bookType, tokenValue, page: String(page) }).toString();
  const key = `${scope}query:${params}`;
  const fetchBooks = useCallback(async (): Promise<BooksPage> => {
    const result = booksResponseSchema.parse(await booksRequest(`/api/v1/books?${params}`));
    return { rows: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(key, fetchBooks, { enabled: mode === null, delay: search ? 300 : 0, reconcile });
  const data = query.data;
  const loading = query.loading || query.stale;
  const view = useCallback((row: BookRow) => setViewing(row), []);
  function saved(rows: BookRow[], replayed: boolean) {
    if (data && !replayed) {
      const term = search.trim().toLowerCase();
      const receipt = /^\d{1,10}$/.test(term) ? Number(term) : null;
      const matches = rows.filter((row) => (!editionId || row.editionId === editionId) && (bookType === "ALL" || row.bookType === bookType)
        && (!tokenValue || row.tokenValuePaise === Number(tokenValue) * 100)
        && ([row.bookNumber, row.editionNameEn, row.editionNameUr].some((value) => value.toLowerCase().includes(term))
          || (receipt !== null && receipt >= row.receiptFrom && receipt <= row.receiptTo)));
      cache.setQueryData(key, { ...data, total: data.total + matches.length,
        rows: data.page === 1 ? [...matches, ...data.rows].slice(0, data.pageSize) : data.rows });
    }
    cache.invalidate(`${scope}query:`); cache.invalidate(`${account.id}:assignments:stock:`); setMode(null); setBusy(false); setSavedCount(rows.length);
  }
  return <AppShell account={account} headerTitle="books" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("booksStock")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("booksDescription")}</p></div>
      <div className={"header-actions flex items-center gap-[12px]"}><Button asChild variant="outline"><Link href="/books/assignments">{t("assignBooks")}</Link></Button>
        <Button variant="outline" onClick={() => setMode("BULK")}><BookOpen size={18} />{t("booksBulkAdd")}</Button>
        <Button onClick={() => setMode("SINGLE")}><Plus size={18} />{t("booksAdd")}</Button></div></div>
    {savedCount > 0 && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] books-notice mb-[20px]"} role="status">{t("booksSaved")} <strong>{savedCount}</strong></p>}
    <Card className={"books-filter-bar grid grid-cols-[minmax(220px,_1.6fr)_repeat(3,_minmax(140px,_1fr))_42px] gap-[14px] items-end p-[18px] max-[1200px]:grid-cols-[repeat(2,_minmax(0,_1fr))]"}><div className={"books-search [&_>_div]:relative [&_svg]:absolute [&_svg]:start-[13px] [&_svg]:top-[15px] [&_svg]:text-[color:var(--muted-foreground)] [&_.input]:ps-[39px]"}><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="stock-search">{t("search")}</label>
      <div><Search size={17} aria-hidden="true" /><Input id="stock-search" type="search" maxLength={100} placeholder={t("booksSearch")}
        value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></div>
      <BookMasterSelect accountId={account.id} kind="EDITION" label="mastersEditions" value={editionId} onChange={(value) => { setEdition(value); setPage(1); }} />
      <BookMasterSelect accountId={account.id} kind="BOOK_TYPE" label="mastersBookTypes" value={bookType === "ALL" ? "" : bookType} onChange={(value) => {
        if (value === "" || value === "REGULAR" || value === "TOKEN") { setBookType(value || "ALL"); if (value === "REGULAR") setTokenValue(""); setPage(1); }
      }} />
      <BookMasterSelect accountId={account.id} kind="TOKEN_VALUE" label="mastersTokenValues" disabled={bookType === "REGULAR"} value={tokenValue} onChange={(value) => {
        if (value === "" || value === "10" || value === "20" || value === "50") { setTokenValue(value); setPage(1); }
      }} />
      <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")} onClick={() => cache.invalidate(`${scope}query:`)}><RefreshCw size={17} /></Button>
    </Card>
    <div className={"books-results flex items-center justify-between gap-[15px] text-[length:12px] min-h-[22px] my-[22px_14px]"}><span>{t("booksRegistered")} {data?.total ?? "—"}</span><span className={"muted text-[color:var(--muted-foreground)]"} role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
    {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</p>}
    <Card className={"books-table-card overflow-hidden [&_.table-container]:mt-0 [&_.books-table_:is(th,_td)]:p-[15px_16px] [&_.books-table_:is(th,_td)]:text-start [&_.books-table_:is(th,_td)]:align-middle [&_.books-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_.books-table_:is(th,_td):first-child]:ps-[20px] [&_.books-table_:is(th,_td):last-child]:pe-[20px] [&_.books-stock-table_:is(th,_td):nth-child(n+5)]:text-center"} aria-busy={loading}><div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6] books-stock-table [table-layout:fixed] min-w-[920px] [&_.button-icon]:w-[30px] [&_.button-icon]:h-[30px] [&_.button-icon]:p-0"}>
      <colgroup><col style={{ width: "14%" }} /><col style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: "17%" }} />
        <col style={{ width: "10%" }} /><col style={{ width: "17%" }} /><col style={{ width: "8%" }} /></colgroup>
      <thead><tr>{(["booksNumber", "mastersEditions", "mastersBookTypes", "booksReceiptRange", "booksTotalReceipts", "status", "usersActions"] as const)
        .map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
      <tbody>{data?.rows.map((row) => <StockRow key={row.id} row={row} onView={view} />)}
        {!data && loading && <tr><td colSpan={7}>{t("working")}</td></tr>}
        {!loading && data?.rows.length === 0 && <tr><td colSpan={7}>{t("booksEmpty")}</td></tr>}</tbody>
    </table></div></Card>
    {data && <div className={"books-pagination flex items-center justify-between gap-[15px] text-[length:12px] pt-[22px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
      <div className={"header-actions flex items-center gap-[12px]"}><Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={mode !== null} busy={busy} onOpenChange={(open) => { if (!open) setMode(null); }} className={"books-editor-dialog w-[min(920px,_calc(100vw_-_40px))]"}
      title={t(mode === "BULK" ? "booksBulkAdd" : "booksAdd")} description={t("booksFormHelp")}>
      {mode && <BookStockForm key={mode} account={account} mode={mode} onBusyChange={setBusy} onSaved={saved} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(open) => { if (!open) setViewing(null); }} className={"books-view-dialog w-[min(640px,_calc(100vw_-_40px))]"} title={t("booksView")} description={t("booksDetailsHelp")}>
      {viewing && <div className={"books-view grid gap-[20px] pt-[22px] [&_dl]:m-0 [&_dl_>_div]:grid [&_dl_>_div]:grid-cols-[160px_minmax(0,_1fr)] [&_dl_>_div]:gap-[15px] [&_dl_>_div]:py-[13px] [&_dl_>_div]:[border-bottom:1px_solid_var(--border)] [&_dt]:text-[color:var(--muted-foreground)] [&_dt]:text-[length:12px] [&_dd]:text-[length:12px] [&_dd]:m-0 [&_dd]:whitespace-pre-wrap [&_dd]:[overflow-wrap:anywhere]"}><h3><bdi dir="ltr">{viewing.bookNumber}</bdi></h3><dl>
        {([["booksStockDate", viewing.stockDate], ["mastersEditions", language === "ur" ? viewing.editionNameUr : viewing.editionNameEn],
          ["mastersBookTypes", t(viewing.bookType === "TOKEN" ? "booksToken" : "booksRegular")],
          ["mastersTokenValues", viewing.tokenValuePaise === null ? "—" : formatCurrency(viewing.tokenValuePaise / 100)],
          ["booksReceiptRange", `${viewing.receiptFrom} – ${viewing.receiptTo}`], ["booksTotalReceipts", String(viewing.totalReceipts)],
          ["booksFaceValue", viewing.faceValuePaise === null ? "—" : formatCurrency(viewing.faceValuePaise / 100)],
          ["status", t(bookStatusLabels[viewing.status])], ["booksEntryBy", viewing.entryByName], ["usersRemarks", viewing.remarks || "—"]] as [MessageKey, string][])
          .map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
      </dl></div>}
    </Dialog>
  </AppShell>;
}
