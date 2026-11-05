"use client";
import Link from "next/link";
import { memo, useCallback, useState, useSyncExternalStore } from "react";
import { BookCheck, BookOpen, BookX, Eye, Flag, HandCoins, LibraryBig, ReceiptText, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BookMasterSelect } from "@/modules/books/components/book-master-select";
import { BookExportButton } from "@/modules/books/components/book-export-button";
import { booksError, booksRequest, bookStatusLabels } from "@/modules/books/books.client";
import { BOOK_STOCK_FILTERS, booksResponseSchema } from "@/modules/books/books.schema";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@/modules/auth/auth.types";
import type { BookRow, BooksPage, BooksQuery, BookStockSummary } from "@/modules/books/books.schema";
import type { MessageKey } from "@/lib/i18n/messages";

const stockStatusLabels: Record<BooksQuery["status"], MessageKey> = {
  ALL: "booksAllOptions", OPEN: "bookStockOpen", CLOSED: "booksClosed", WITH_FUNDRAISER: "booksAssigned",
  LEFTOVER: "leftoversScreen", REOPENED: "submissionStatusReopened",
};

function reconcile(previous: BooksPage | undefined, next: BooksPage): BooksPage {
  const existing = new Map(previous?.rows.map((row) => [row.id, row]));
  return { ...next, rows: next.rows.map((row) => {
    const cached = existing.get(row.id);
    return cached && JSON.stringify(cached) === JSON.stringify(row) ? cached : row;
  }) };
}
const StockRow = memo(function StockRow({ row, onView }: { row: BookRow; onView: (row: BookRow) => void }) {
  const { t, language } = useLanguage();
  return <tr><td><button type="button" className={"books-number-link [border:0] p-0 bg-[transparent] text-[color:var(--primary)] [font:inherit] font-semibold cursor-pointer text-start [&:hover]:[text-decoration:underline]"} onClick={() => onView(row)}><bdi dir="ltr">{row.editionBookNumber ? `${t("booksSingle")} ${row.editionBookNumber}` : row.bookNumber}</bdi></button>
    <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"} dir="ltr">{row.stockDate}</span></td>
    <td>{language === "ur" ? row.editionNameUr : row.editionNameEn}</td>
    <td>{t(row.bookType === "TOKEN" ? "booksToken" : "booksRegular")}{row.tokenValuePaise !== null && <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{formatCurrency(row.tokenValuePaise / 100)}</span>}</td>
    <td><bdi dir="ltr">{row.receiptFrom} – {row.receiptTo}</bdi></td><td>{row.totalReceipts}</td>
    <td><Badge tone={row.status === "IN_STOCK" || row.status === "CLOSED" ? "success" : row.status === "FLAGGED" || row.status === "LOST" ? "danger" : "warning"}>{t(row.reopened ? "submissionStatusReopened" : bookStatusLabels[row.status])}</Badge></td>
    <td><Button variant="ghost" size="icon" aria-label={t("booksView")} title={t("booksView")} onClick={() => onView(row)}><Eye size={17} /></Button></td></tr>;
});
function StockSummaryCards({ summary, bookType }: { summary: BookStockSummary | undefined; bookType: BooksQuery["bookType"] }) {
  const { t, language } = useLanguage();
  if (!summary) return <section className="mt-5" role="status" aria-label={t("booksStockSummary")}>
    <div className="mb-3 h-4 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) =>
      <Card key={i} className="min-h-28 p-4" aria-hidden="true">
        <div className="h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="mt-2 h-2.5 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </Card>)}</div>
  </section>;
  const number = new Intl.NumberFormat(language === "ur" ? "ur-IN" : "en-IN");
  const range = (from: number | null, to: number | null) => from === null || to === null ? "—" : `${number.format(from)}–${number.format(to)}`;
  const share = (value: number) => `${number.format(summary.books ? Math.round(value / summary.books * 100) : 0)}% ${t("booksStockShare")}`;
  const cards = [
    { label: "editionSummaryBooks", value: summary.books, icon: BookOpen,
      detail: `${t("booksNumber")}: ${range(summary.bookFrom, summary.bookTo)}`, tone: "border-emerald-200 bg-emerald-50/80 text-emerald-900", iconTone: "bg-emerald-100 text-emerald-700" },
    { label: "booksInStock", value: summary.available, icon: LibraryBig, detail: share(summary.available), tone: "border-border bg-white text-foreground", iconTone: "bg-sky-50 text-sky-700" },
    { label: "booksAssigned", value: summary.assigned, icon: HandCoins, detail: share(summary.assigned), tone: "border-border bg-white text-foreground", iconTone: "bg-amber-50 text-amber-700" },
    { label: "booksClosed", value: summary.closed, icon: BookCheck, detail: share(summary.closed), tone: "border-border bg-white text-foreground", iconTone: "bg-violet-50 text-violet-700" },
    { label: "booksPartlyUsed", value: summary.partlyUsed, icon: RotateCcw, detail: share(summary.partlyUsed), tone: "border-border bg-white text-foreground", iconTone: "bg-teal-50 text-teal-700" },
    { label: "booksLost", value: summary.lost, icon: BookX, detail: share(summary.lost), tone: "border-border bg-white text-foreground", iconTone: "bg-rose-50 text-rose-700" },
    { label: "booksFlagged", value: summary.flagged, icon: Flag, detail: share(summary.flagged), tone: "border-border bg-white text-foreground", iconTone: "bg-orange-50 text-orange-700" },
    { label: "booksTotalReceipts", value: summary.receipts, icon: ReceiptText,
      detail: range(summary.receiptFrom, summary.receiptTo), tone: "border-border bg-white text-foreground", iconTone: "bg-rose-50 text-rose-700" },
  ] as const;
  return <section className="mt-5" aria-label={t("booksStockSummary")}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold">{(language === "ur" ? summary.editionNameUr : summary.editionNameEn) || t("mastersEditions")}</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("booksStockSummaryHelp")}</p></div>
      <Badge tone="success">{t(bookType === "TOKEN" ? "booksToken" : "booksRegular")}</Badge>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, detail, tone, iconTone }) =>
      <div key={label} className={`min-w-0 rounded-2xl border p-4 ${tone}`}>
        <div className="flex items-start justify-between gap-2"><span className="text-[11px] font-medium leading-relaxed">{t(label)}</span>
          <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl ${iconTone}`}><Icon size={16} aria-hidden="true" /></span></div>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{number.format(value)}</p>
        <p className="mt-1 text-[10px] leading-relaxed opacity-70">{detail}</p>
      </div>)}</div>
  </section>;
}

export function BooksScreen({ account }: { account: Account }) {
  const { t, language } = useLanguage();
  const cache = usePageDataCache();
  const scope = `${account.id}:books:`;
  const [search, setSearch] = usePageState(`${scope}filters:search`, "");
  const [editionId, setEdition] = usePageState(`${scope}filters:edition`, "");
  const [bookType, setBookType] = usePageState<BooksQuery["bookType"]>(`${scope}filters:type`, "ALL");
  const [tokenValue, setTokenValue] = usePageState<BooksQuery["tokenValue"]>(`${scope}filters:token`, "");
  const [status, setStatus] = usePageState<BooksQuery["status"]>(`${scope}filters:status`, "ALL");
  const [page, setPage] = usePageState(`${scope}filters:page`, 1);
  const [viewing, setViewing] = useState<BookRow | null>(null);
  const params = new URLSearchParams({ search: search.trim(), editionId, bookType, tokenValue, status, page: String(page) }).toString();
  const key = `${scope}query:stock-v4:${params}`;
  const summaryKey = `${scope}query:stock-summary-v2:${bookType}:${editionId}:${tokenValue}`;
  const subscribeSummary = useCallback((notify: () => void) => {
    const entry = cache.entry(summaryKey);
    entry.listeners.add(notify);
    return () => { entry.listeners.delete(notify); };
  }, [cache, summaryKey]);
  const summarySnapshot = useCallback(() => cache.entry(summaryKey).state, [cache, summaryKey]);
  const summaryState = useSyncExternalStore(subscribeSummary, summarySnapshot, summarySnapshot);
  const fetchBooks = useCallback(async (): Promise<BooksPage> => {
    const entry = cache.entry(summaryKey);
    const generation = entry.generation;
    const includeSummary = entry.state.data === undefined || entry.state.stale;
    const result = booksResponseSchema.parse(await booksRequest(`/api/v1/books?${params}&summary=${includeSummary ? "1" : "0"}`));
    const { summary, ...pagination } = result.meta;
    if (summary && entry.generation === generation) cache.setQueryData(summaryKey, summary);
    return { rows: result.data, ...pagination };
  }, [cache, params, summaryKey]);
  const ready = bookType !== "ALL" && Boolean(editionId);
  const query = usePageQuery(key, fetchBooks, { enabled: ready, delay: search ? 300 : 0, reconcile });
  const data = ready ? query.data : undefined;
  const summary = ready && !summaryState.stale ? summaryState.data as BookStockSummary | undefined : undefined;
  const loading = ready && (query.loading || query.stale);
  const selectClass = "input block min-h-[47px] w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-[var(--card)] px-3.5 py-3 text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50";
  function changeType(value: string) {
    if ((value !== "ALL" && value !== "REGULAR" && value !== "TOKEN") || value === bookType) return;
    if (bookType !== "ALL") cache.write(`${scope}selection:${bookType}`, { search, editionId, tokenValue, status, page });
    const previous = cache.read<Pick<BooksQuery, "search" | "editionId" | "tokenValue" | "status" | "page">>(
      `${scope}selection:${value}`, { search: "", editionId: "", tokenValue: "", status: "ALL", page: 1 });
    setBookType(value); setSearch(previous.search); setEdition(previous.editionId);
    setTokenValue(value === "TOKEN" ? previous.tokenValue : ""); setStatus(previous.status ?? "ALL"); setPage(previous.page);
  }
  const view = useCallback((row: BookRow) => setViewing(row), []);
  return <AppShell account={account} headerTitle="books" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("booksStock")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("booksEditionStockHelp")}</p></div>
      <div className={"header-actions flex items-center gap-[12px]"}><Button asChild variant="outline"><Link href="/books/assignments">{t("assignBooks")}</Link></Button>
      </div></div>
    <Card className="grid grid-cols-[minmax(160px,1.3fr)_minmax(110px,.8fr)_minmax(140px,1fr)_minmax(85px,.55fr)_minmax(125px,.8fr)_auto] items-end gap-3 p-[18px] max-[1280px]:grid-cols-3"><div className={"books-search [&_>_div]:relative [&_svg]:absolute [&_svg]:start-[13px] [&_svg]:top-[15px] [&_svg]:text-[color:var(--muted-foreground)] [&_.input]:ps-[39px]"}><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="stock-search">{t("search")}</label>
      <div><Search size={17} aria-hidden="true" /><Input id="stock-search" type="search" maxLength={100} placeholder={t("booksSearch")}
        value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></div>
      <div className="min-w-0"><label className="mb-2 block text-xs font-semibold" htmlFor="stock-type">{t("mastersBookTypes")}</label>
        <select id="stock-type" className={selectClass} value={bookType} onChange={(event) => changeType(event.target.value)}>
          <option value="ALL">{t("booksChooseOption")}</option><option value="REGULAR">{t("booksRegular")}</option><option value="TOKEN">{t("booksToken")}</option>
        </select>
      </div>
      <BookMasterSelect key={bookType} accountId={account.id} kind="EDITION" bookType={bookType === "ALL" ? undefined : bookType} label="mastersEditions" required disabled={bookType === "ALL"} value={editionId} onChange={(value) => { setEdition(value); setPage(1); }} />
      <div className="min-w-0"><label className="mb-2 block text-xs font-semibold" htmlFor="stock-token">{t("mastersTokenValues")}</label>
        <select id="stock-token" className={selectClass} value={tokenValue} disabled={bookType !== "TOKEN"} onChange={(event) => {
          const value = event.target.value;
          if (value === "" || value === "10" || value === "50" || value === "100") { setTokenValue(value); setPage(1); }
        }}><option value="">{t("booksAllOptions")}</option>{["10", "50", "100"].map((value) => <option key={value} value={value}>₹{value}</option>)}</select>
      </div>
      <div className="min-w-0"><label className="mb-2 block text-xs font-semibold" htmlFor="stock-status">{t("status")}</label>
        <select id="stock-status" className={selectClass} value={status} disabled={!ready} onChange={(event) => {
          const value = BOOK_STOCK_FILTERS.find((option) => option === event.target.value);
          if (value) { setStatus(value); setPage(1); }
        }}>{BOOK_STOCK_FILTERS.map((value) => <option key={value} value={value}>{t(stockStatusLabels[value])}</option>)}</select>
      </div>
      <div className="flex items-center gap-2">
        <BookExportButton source="STOCK" disabled={!ready || loading || !data?.total} filters={{ search: search.trim(), bookType, editionId, tokenValue, stockStatus: status }} />
        <Button variant="outline" size="icon" loading={loading} disabled={!ready} aria-label={t("usersRefresh")} onClick={() => { cache.invalidate(summaryKey); cache.invalidate(key); }}><RefreshCw size={17} /></Button>
      </div>
    </Card>
    {ready && (query.error == null || summary) && <StockSummaryCards summary={summary} bookType={bookType} />}
    <div className={"books-results flex items-center justify-between gap-[15px] text-[length:12px] min-h-[22px] my-[22px_14px]"}><span>{t("booksRegistered")} {data?.total ?? "—"}</span><span className={"muted text-[color:var(--muted-foreground)]"} role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
    {ready && query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</p>}
    <Card className={"books-table-card overflow-hidden [&_.table-container]:mt-0 [&_.books-table_:is(th,_td)]:p-[15px_16px] [&_.books-table_:is(th,_td)]:text-start [&_.books-table_:is(th,_td)]:align-middle [&_.books-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_.books-table_:is(th,_td):first-child]:ps-[20px] [&_.books-table_:is(th,_td):last-child]:pe-[20px] [&_.books-stock-table_:is(th,_td):nth-child(n+5)]:text-center"} aria-busy={loading}><div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6] books-stock-table [table-layout:fixed] min-w-[920px] [&_.button-icon]:w-[30px] [&_.button-icon]:h-[30px] [&_.button-icon]:p-0"}>
      <colgroup><col style={{ width: "14%" }} /><col style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: "17%" }} />
        <col style={{ width: "10%" }} /><col style={{ width: "17%" }} /><col style={{ width: "8%" }} /></colgroup>
      <thead><tr>{(["booksNumber", "mastersEditions", "mastersBookTypes", "booksReceiptRange", "booksTotalReceipts", "status", "usersActions"] as const)
        .map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
      <tbody>{loading ? Array.from({ length: 6 }, (_, row) => <tr key={row} aria-hidden="true">
        {Array.from({ length: 7 }, (_, column) => <td key={column}>
          <div className={`h-4 animate-pulse rounded bg-[var(--muted)] motion-reduce:animate-none ${column >= 4 ? "mx-auto w-12" : row % 2 ? "w-3/4" : "w-5/6"}`} />
          {column === 0 && <div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-[var(--muted)] motion-reduce:animate-none" />}
        </td>)}
      </tr>) : data?.rows.map((row) => <StockRow key={row.id} row={row} onView={view} />)}
        {!ready && <tr><td colSpan={7} className="h-32 text-center text-[var(--muted-foreground)]">{t("booksSelectStockFilters")}</td></tr>}
        {ready && !loading && data?.rows.length === 0 && <tr><td colSpan={7}>{t("booksEmpty")}</td></tr>}</tbody>
    </table></div></Card>
    {data && <div className={"books-pagination flex items-center justify-between gap-[15px] text-[length:12px] pt-[22px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
      <div className={"header-actions flex items-center gap-[12px]"}><Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={viewing !== null} onOpenChange={(open) => { if (!open) setViewing(null); }} className={"books-view-dialog w-[min(640px,_calc(100vw_-_40px))]"} title={t("booksView")} description={t("booksDetailsHelp")}>
      {viewing && <div className={"books-view grid gap-[20px] pt-[22px] [&_dl]:m-0 [&_dl_>_div]:grid [&_dl_>_div]:grid-cols-[160px_minmax(0,_1fr)] [&_dl_>_div]:gap-[15px] [&_dl_>_div]:py-[13px] [&_dl_>_div]:[border-bottom:1px_solid_var(--border)] [&_dt]:text-[color:var(--muted-foreground)] [&_dt]:text-[length:12px] [&_dd]:text-[length:12px] [&_dd]:m-0 [&_dd]:whitespace-pre-wrap [&_dd]:[overflow-wrap:anywhere]"}><h3><bdi dir="ltr">{viewing.editionBookNumber ? `${t("booksSingle")} ${viewing.editionBookNumber}` : viewing.bookNumber}</bdi></h3><dl>
        {([["booksStockDate", viewing.stockDate], ["mastersEditions", language === "ur" ? viewing.editionNameUr : viewing.editionNameEn],
          ["mastersBookTypes", t(viewing.bookType === "TOKEN" ? "booksToken" : "booksRegular")],
          ["mastersTokenValues", viewing.tokenValuePaise === null ? "—" : formatCurrency(viewing.tokenValuePaise / 100)],
          ["booksReceiptRange", `${viewing.receiptFrom} – ${viewing.receiptTo}`], ["booksTotalReceipts", String(viewing.totalReceipts)],
          ["booksFaceValue", viewing.faceValuePaise === null ? "—" : formatCurrency(viewing.faceValuePaise / 100)],
          ["status", t(viewing.reopened ? "submissionStatusReopened" : bookStatusLabels[viewing.status])], ["booksEntryBy", viewing.entryByName], ["usersRemarks", viewing.remarks || "—"]] as [MessageKey, string][])
          .map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
      </dl></div>}
    </Dialog>
  </AppShell>;
}
