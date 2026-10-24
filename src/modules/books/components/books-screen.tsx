"use client";
import Link from "next/link";
import { memo, useCallback, useState } from "react";
import { Eye, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BookMasterSelect } from "@/modules/books/components/book-master-select";
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
  return <tr><td><button type="button" className={"books-number-link [border:0] p-0 bg-[transparent] text-[color:var(--primary)] [font:inherit] font-semibold cursor-pointer text-start [&:hover]:[text-decoration:underline]"} onClick={() => onView(row)}><bdi dir="ltr">{row.editionBookNumber ? `${t("booksSingle")} ${row.editionBookNumber}` : row.bookNumber}</bdi></button>
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
  const [search, setSearch] = usePageState(`${scope}filters:search`, "");
  const [editionId, setEdition] = usePageState(`${scope}filters:edition`, "");
  const [bookType, setBookType] = usePageState<BooksQuery["bookType"]>(`${scope}filters:type`, "ALL");
  const [tokenValue, setTokenValue] = usePageState<BooksQuery["tokenValue"]>(`${scope}filters:token`, "");
  const [page, setPage] = usePageState(`${scope}filters:page`, 1);
  const [viewing, setViewing] = useState<BookRow | null>(null);
  const params = new URLSearchParams({ search: search.trim(), editionId, bookType, tokenValue, page: String(page) }).toString();
  const key = `${scope}query:${params}`;
  const fetchBooks = useCallback(async (): Promise<BooksPage> => {
    const result = booksResponseSchema.parse(await booksRequest(`/api/v1/books?${params}`));
    return { rows: result.data, ...result.meta };
  }, [params]);
  const ready = bookType !== "ALL" && Boolean(editionId);
  const query = usePageQuery(key, fetchBooks, { enabled: ready, delay: search ? 300 : 0, reconcile });
  const data = ready ? query.data : undefined;
  const loading = ready && (query.loading || query.stale);
  const selectClass = "input block min-h-[47px] w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-[var(--card)] px-3.5 py-3 text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50";
  function changeType(value: string) {
    if ((value !== "ALL" && value !== "REGULAR" && value !== "TOKEN") || value === bookType) return;
    if (bookType !== "ALL") cache.write(`${scope}selection:${bookType}`, { search, editionId, tokenValue, page });
    const previous = cache.read<Pick<BooksQuery, "search" | "editionId" | "tokenValue" | "page">>(
      `${scope}selection:${value}`, { search: "", editionId: "", tokenValue: "", page: 1 });
    setBookType(value); setSearch(previous.search); setEdition(previous.editionId);
    setTokenValue(value === "TOKEN" ? previous.tokenValue : ""); setPage(previous.page);
  }
  const view = useCallback((row: BookRow) => setViewing(row), []);
  return <AppShell account={account} headerTitle="books" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("booksStock")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("booksEditionStockHelp")}</p></div>
      <div className={"header-actions flex items-center gap-[12px]"}><Button asChild variant="outline"><Link href="/books/assignments">{t("assignBooks")}</Link></Button>
      </div></div>
    <Card className={"books-filter-bar grid grid-cols-[minmax(220px,_1.6fr)_repeat(3,_minmax(140px,_1fr))_42px] gap-[14px] items-end p-[18px] max-[1200px]:grid-cols-[repeat(2,_minmax(0,_1fr))]"}><div className={"books-search [&_>_div]:relative [&_svg]:absolute [&_svg]:start-[13px] [&_svg]:top-[15px] [&_svg]:text-[color:var(--muted-foreground)] [&_.input]:ps-[39px]"}><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="stock-search">{t("search")}</label>
      <div><Search size={17} aria-hidden="true" /><Input id="stock-search" type="search" maxLength={100} placeholder={t("booksSearch")}
        value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></div>
      <div className="min-w-0"><label className="mb-2 block text-xs font-semibold" htmlFor="stock-type">{t("mastersBookTypes")}</label>
        <select id="stock-type" className={selectClass} value={bookType} onChange={(event) => changeType(event.target.value)}>
          <option value="ALL">{t("booksChooseOption")}</option><option value="REGULAR">{t("booksRegular")}</option><option value="TOKEN">{t("booksToken")}</option>
        </select>
      </div>
      <BookMasterSelect accountId={account.id} kind="EDITION" label="mastersEditions" required disabled={bookType === "ALL"} value={editionId} onChange={(value) => { setEdition(value); setPage(1); }} />
      <div className="min-w-0"><label className="mb-2 block text-xs font-semibold" htmlFor="stock-token">{t("mastersTokenValues")}</label>
        <select id="stock-token" className={selectClass} value={tokenValue} disabled={bookType !== "TOKEN"} onChange={(event) => {
          const value = event.target.value;
          if (value === "" || value === "10" || value === "50" || value === "100") { setTokenValue(value); setPage(1); }
        }}><option value="">{t("booksAllOptions")}</option>{["10", "50", "100"].map((value) => <option key={value} value={value}>₹{value}</option>)}</select>
      </div>
      <Button variant="outline" size="icon" loading={loading} disabled={!ready} aria-label={t("usersRefresh")} onClick={() => cache.invalidate(key)}><RefreshCw size={17} /></Button>
    </Card>
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
          ["status", t(bookStatusLabels[viewing.status])], ["booksEntryBy", viewing.entryByName], ["usersRemarks", viewing.remarks || "—"]] as [MessageKey, string][])
          .map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
      </dl></div>}
    </Dialog>
  </AppShell>;
}
