"use client";
import Link from "next/link";
import { memo, useCallback } from "react";
import { RefreshCw, Search } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest, bookStatusLabels } from "@/modules/books/books.client";
import { BOOK_STATUSES } from "@/modules/books/books.schema";
import { displayMoney } from "@/modules/books/returns.schema";
import { editionOverviewResponseSchema, editionBookPageResponseSchema } from "@/modules/books/edition-summary.schema";
import type { EditionBookSummary, EditionOverview, EditionSummaryQuery } from "@/modules/books/edition-summary.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { MessageKey } from "@/lib/i18n/messages";

const SummaryRow = memo(function SummaryRow({ row, edition }: { row: EditionBookSummary; edition: EditionOverview["edition"] }) {
  const { t, language } = useLanguage();
  const number = row.ordinal === null ? row.number : edition.bookType === "TOKEN"
    ? `T-${(edition.tokenValuePaise ?? 0) / 100}-Book${row.ordinal}/${row.receiptFrom}`
    : `${edition.number === null ? "" : `ED-${String(edition.number).padStart(2, "0")}-`}Book${row.ordinal}/${row.receiptFrom}`;
  return <tr>
    <td><strong className="block font-semibold" dir="ltr">{number}</strong><span className="mt-1 block text-[11px] text-muted-foreground" dir="ltr">{row.receiptFrom}–{row.receiptTo}</span>
      <span className="mt-1.5 block"><Badge tone={row.status === "FLAGGED" || row.status === "LOST" ? "danger" : row.status === "CLOSED" ? "success" : "neutral"}>{t(bookStatusLabels[row.status])}</Badge></span></td>
    <td>{row.fundraiser || "—"}</td><td className="tabular-nums">{row.entered}/{row.receiptTo - row.receiptFrom + 1}</td>
    <td><strong className="block tabular-nums">{displayMoney(row.collectedPaise, language)}</strong>
      <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{t("editionSummaryCash")}: {displayMoney(row.cashPaise, language)}<br />{t("editionSummaryDigital")}: {displayMoney(row.digitalPaise, language)}
        {row.chequePaise > 0 && <><br />{t("editionSummaryCheque")}: {displayMoney(row.chequePaise, language)}</>}</span></td>
    <td className="tabular-nums">{displayMoney(row.commissionPaise, language)}</td><td className="font-semibold tabular-nums text-primary">{displayMoney(row.netPaise, language)}</td>
    <td>{row.submissionId ? <Button asChild variant="outline" size="small"><Link prefetch={false} href={`/receipt-entry/${row.submissionId}`}>{t("usersView")}</Link></Button> : "—"}</td>
  </tr>;
});

function reconcileBooks(previous: EditionOverview["books"] | undefined, next: EditionOverview["books"]) {
  const rows = new Map(previous?.rows.map((row) => [row.id, row]));
  return { ...next, rows: next.rows.map((row) => {
    const before = rows.get(row.id);
    return before && JSON.stringify(before) === JSON.stringify(row) ? before : row;
  }) };
}
function reconcileOverview(previous: EditionOverview | undefined, next: EditionOverview): EditionOverview {
  return { ...next, edition: previous && JSON.stringify(previous.edition) === JSON.stringify(next.edition) ? previous.edition : next.edition,
    books: reconcileBooks(previous?.books, next.books) };
}

export function EditionSummaryScreen({ account, editionId }: { account: Account; editionId: string }) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:edition-summary:${editionId}:`;
  const [search, setSearch] = usePageState(`${scope}search`, "");
  const [status, setStatus] = usePageState<EditionSummaryQuery["status"]>(`${scope}status`, "ALL");
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const endpoint = `/api/v1/books/editions/${editionId}/summary`;
  const loadOverview = useCallback(async () => editionOverviewResponseSchema.parse(await booksRequest(endpoint)).data, [endpoint]);
  const overview = usePageQuery(`${scope}overview`, loadOverview, { reconcile: reconcileOverview });
  const firstPage = !search.trim() && status === "ALL" && page === 1;
  const params = new URLSearchParams({ search: search.trim(), status, page: String(page), view: "books" }).toString();
  const loadBooks = useCallback(async () => editionBookPageResponseSchema.parse(await booksRequest(`${endpoint}?${params}`)).data, [endpoint, params]);
  const bookQuery = usePageQuery(`${scope}books:${params}`, loadBooks, { enabled: !firstPage && Boolean(overview.data), delay: search ? 300 : 0, reconcile: reconcileBooks });
  const data = overview.data; const books = firstPage ? data?.books : bookQuery.data;
  const loading = firstPage ? overview.loading || overview.stale : !data || bookQuery.loading || bookQuery.stale;
  const failure = overview.error ?? (!firstPage ? bookQuery.error : null);
  const totals = data?.totals;
  const stateCounts: [MessageKey, number][] = totals ? [["booksInStock", totals.inStock], ["booksAssigned", totals.assigned],
    ["booksPartlyUsed", totals.partlyUsed], ["booksClosed", totals.closed], ["booksFlagged", totals.flagged], ["booksLost", totals.lost]] : [];
  return <AppShell account={account} headerTitle="mastersEditions" sampleData={false} search="" onSearchChange={() => {}}>
    <div className="mb-5 flex items-start justify-between gap-4"><div><h1 className="text-[28px] font-bold">{t("editionSummary")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{data ? `${language === "ur" ? data.edition.nameUr : data.edition.nameEn} · ${data.edition.code}${data.edition.printingYear ? ` · ${data.edition.printingYear}` : ""}` : t("editionSummaryHelp")}</p></div>
      <div className="flex shrink-0 gap-2"><Button asChild variant="outline" size="small"><Link prefetch={false} href="/books/editions">{t("mastersEditions")}</Link></Button>
        <Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={overview.loading || (!firstPage && bookQuery.loading)} onClick={() => cache.invalidate(scope)}><RefreshCw size={17} /></Button></div></div>
    {failure != null && <p role="alert" className="mb-4 rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{t(booksError(failure))}</p>}
    {!data && failure == null && <div role="status" aria-label={t("working")} className="mb-4 grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((key) => <Card key={key} className="h-28 animate-pulse bg-muted" />)}</div>}
    {data && totals && <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{([
        ["editionSummaryCollected", displayMoney(totals.collectedPaise, language), `${t("editionSummaryFinalized")}: ${displayMoney(totals.finalizedPaise, language)}`],
        ["returnsCommissionAmount", displayMoney(totals.commissionPaise, language), ""],
        ["returnsNet", displayMoney(totals.netPaise, language), ""],
        ["editionSummaryBooks", String(totals.books), `${t("booksTotalReceipts")}: ${totals.receipts}`],
      ] as [MessageKey, string, string][]).map(([label, value, note], index) => <Card key={label} className={`min-w-0 rounded-2xl p-4 ${index === 0 ? "border-primary/15 bg-[var(--primary-soft)]" : ""}`}>
        <p className="text-xs text-muted-foreground">{t(label)}</p><strong className={`mt-2 block text-2xl font-bold tabular-nums ${index === 2 ? "text-primary" : ""}`}>{value}</strong>
        {note && <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>}</Card>)}</div>
      <Card className="my-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">{stateCounts.map(([label, value]) => <div key={label} className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">{t(label)}</span><b className="tabular-nums">{value}</b></div>)}</Card>
      <div className="mb-4 grid gap-3 xl:grid-cols-2"><Card className="p-4"><h2 className="mb-3 text-xs font-semibold">{t("editionSummaryPayments")}</h2>
        <div className="grid grid-cols-3 gap-3">{([["editionSummaryCash", totals.cashPaise], ["editionSummaryDigital", totals.digitalPaise], ["editionSummaryCheque", totals.chequePaise]] as [MessageKey, number][]).map(([label, amount]) =>
          <div key={label}><p className="text-[11px] text-muted-foreground">{t(label)}</p><strong className="mt-1 block text-sm tabular-nums">{displayMoney(amount, language)}</strong></div>)}</div></Card>
        <Card className="p-4"><div className="grid grid-cols-3 gap-x-4 gap-y-3">{([
          ["receiptEntered", totals.entered], ["submissionChecked", totals.checked], ["editionSummaryUnentered", Math.max(0, totals.receipts - totals.entered)],
          ["editionSummaryCancelled", totals.cancelled], ["editionSummaryIssues", totals.damaged],
        ] as [MessageKey, number][]).map(([label, value]) => <div key={label}><p className="text-[11px] text-muted-foreground">{t(label)}</p><b className="mt-1 block text-sm tabular-nums">{value}</b></div>)}</div></Card></div>
      <p className="mb-4 text-xs text-muted-foreground">{t("editionSummaryBasis")}</p>
    </>}
    {data && <>
      <Card className="mb-3 flex items-center gap-3 p-3"><label className="relative min-w-0 flex-1"><Search size={17} aria-hidden="true" className="pointer-events-none absolute start-3 top-3.5 text-muted-foreground" />
        <Input type="search" maxLength={100} value={search} className="ps-10" placeholder={t("editionSummarySearch")} aria-label={t("editionSummarySearch")} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <select aria-label={t("status")} value={status} className="min-h-11 w-48 rounded-[var(--radius-control)] border border-input bg-card px-3 text-sm"
          onChange={(event) => { const value = event.target.value; if (value === "ALL" || BOOK_STATUSES.some((item) => item === value)) { setStatus(value as EditionSummaryQuery["status"]); setPage(1); } }}>
          <option value="ALL">{t("peopleAllStatuses")}</option>{BOOK_STATUSES.map((value) => <option key={value} value={value}>{t(bookStatusLabels[value])}</option>)}</select></Card>
      <div className="mb-3 flex items-center justify-between text-xs"><h2 className="font-semibold">{t("editionSummaryBooks")} · {books?.total ?? "—"}</h2>{loading && <span role="status" className="text-muted-foreground">{t("working")}</span>}</div>
      <Card className="overflow-hidden"><div className="overflow-x-auto [scrollbar-width:thin]"><table aria-busy={loading} className="w-full min-w-[1050px] table-fixed border-collapse text-start text-xs [&_th]:bg-muted/60 [&_th]:px-4 [&_th]:py-3 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-4 [&_td]:align-middle">
        <colgroup><col className="w-[23%]" /><col className="w-[16%]" /><col className="w-[10%]" /><col className="w-[17%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[10%]" /></colgroup>
        <thead><tr>{(["booksNumber", "editionSummaryLatestFundraiser", "receiptEntered", "editionSummaryCollected", "returnsCommissionAmount", "returnsNet", "usersActions"] as MessageKey[]).map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{loading && !books ? Array.from({ length: 5 }, (_, index) => <tr key={index}>{[0, 1, 2, 3, 4, 5, 6].map((key) => <td key={key}><div className="h-5 animate-pulse rounded bg-muted" /></td>)}</tr>)
          : books?.rows.map((row) => <SummaryRow key={row.id} row={row} edition={data.edition} />)}
          {!loading && books?.rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground">{t("editionSummaryEmpty")}</td></tr>}</tbody>
      </table></div></Card>
      {books && <div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">{t("usersPage")} {books.page}/{Math.max(1, Math.ceil(books.total / books.pageSize))}</span>
        <div className="flex gap-2"><Button variant="outline" size="small" disabled={loading || books.page <= 1} onClick={() => setPage(books.page - 1)}>{t("usersPrevious")}</Button>
          <Button variant="outline" size="small" disabled={loading || books.page * books.pageSize >= books.total} onClick={() => setPage(books.page + 1)}>{t("usersNext")}</Button></div></div>}
    </>}
  </AppShell>;
}
