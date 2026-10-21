"use client";
import Link from "next/link";
import { memo, useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AssignmentForm } from "@/modules/books/components/assignment-form";
import { AssignmentSlipView } from "@/modules/books/components/assignment-slip";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { displayMoney } from "@/modules/books/returns.schema";
import { leftoversResponseSchema } from "@/modules/books/leftovers.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { AssignmentDetail } from "@/modules/books/assignments.schema";
import type { BooksPage } from "@/modules/books/books.schema";
import type { LeftoverRow, LeftoversPage, LeftoversQuery } from "@/modules/books/leftovers.schema";

const LeftoverTableRow = memo(function LeftoverTableRow({ row, checked, blocked, onToggle, onAssign }: { row: LeftoverRow; checked: boolean; blocked: boolean;
  onToggle: (row: LeftoverRow) => void; onAssign: (row: LeftoverRow) => void;
}) {
  const { t, language } = useLanguage();
  return <tr><td><input type="checkbox" aria-label={`${t("leftoversSelect")} ${row.code}`} checked={checked} disabled={!row.assignable || blocked}
    onChange={() => onToggle(row)} /></td><td><strong>{row.code}</strong><span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{t("leftoversOriginalBook")}: {row.book.bookNumber}</span>
    <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{language === "ur" ? row.book.editionNameUr : row.book.editionNameEn} · {t(row.book.bookType === "TOKEN" ? "booksToken" : "booksRegular")}
      {row.book.tokenValuePaise !== null && ` ${displayMoney(row.book.tokenValuePaise, language)}`}</span></td>
    <td>{row.returnedByName}</td><td>{row.returnDate}</td><td><bdi dir="ltr">{row.receiptFrom}–{row.receiptTo}</bdi></td><td>{row.receiptTo - row.receiptFrom + 1}</td>
    <td><Badge tone={row.status === "AVAILABLE" ? "success" : row.status === "HELD" ? "danger" : "warning"}>{t(row.status === "AVAILABLE" ? "leftoversAvailable" : row.status === "HELD" ? "leftoversHeld" : "booksAssigned")}</Badge></td>
    <td><Button variant="outline" size="small" disabled={!row.assignable} onClick={() => onAssign(row)}>{t("leftoversAssign")}</Button></td></tr>;
});
function reconcile(previous: LeftoversPage | undefined, next: LeftoversPage) {
  const prior = new Map(previous?.rows.map((row) => [row.id, row]));
  return { ...next, rows: next.rows.map((row) => {
    const old = prior.get(row.id); return old && old.updatedAt === row.updatedAt && old.book.updatedAt === row.book.updatedAt
      && old.status === row.status && old.assignable === row.assignable ? old : row;
  }) };
}
export function LeftoversScreen({ account }: { account: Account }) {
  const { t } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:leftovers:`;
  const [search, setSearch] = usePageState(`${scope}search`, ""); const [page, setPage] = usePageState(`${scope}page`, 1);
  const [status, setStatus] = usePageState<LeftoversQuery["status"]>(`${scope}status`, "AVAILABLE");
  const [selected, setSelected] = useState<LeftoverRow[]>([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null); const [notice, setNotice] = useState("");
  const params = new URLSearchParams({ search: search.trim(), status, page: String(page) }).toString(); const key = `${scope}query:${params}`;
  const fetchData = useCallback(async (): Promise<LeftoversPage> => {
    const result = leftoversResponseSchema.parse(await booksRequest(`/api/v1/leftover-books?${params}`)); return { rows: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(key, fetchData, { enabled: !open, delay: search ? 300 : 0, reconcile });
  const data = query.data; const loading = query.loading || query.stale;
  const toggle = useCallback((row: LeftoverRow) => setSelected((rows) => rows.some((item) => item.id === row.id) ? rows.filter((item) => item.id !== row.id)
    : rows.length < 150 && !rows.some((item) => item.book.id === row.book.id) ? [...rows, row] : rows), []);
  const assign = useCallback((row: LeftoverRow) => { setSelected([row]); setOpen(true); }, []);
  function saved(detail: AssignmentDetail) {
    const updatedBooks = new Map(detail.books.map((book) => [book.id, book]));
    const changed = selected.filter((row) => updatedBooks.has(row.book.id)); const changedIds = new Set(changed.map((row) => row.id));
    cache.setQueryData(`${account.id}:assignments:detail:${detail.assignment.id}`, detail);
    cache.invalidate(scope); cache.invalidate(`${account.id}:assignments:query:`); cache.invalidate(`${account.id}:returns:open:`);
    cache.invalidate(`${account.id}:books:query:`);
    if (data && (status === "ALL" || status === "AVAILABLE")) {
      const term = search.trim().toLowerCase(); const removed = changed.filter((row) => [row.code, row.book.bookNumber, row.returnedByName].some((value) => value.toLowerCase().includes(term))).length;
      const rows = status === "AVAILABLE" ? data.rows.filter((row) => !changedIds.has(row.id)) : data.rows.map((row) => changedIds.has(row.id)
        ? { ...row, status: "ASSIGNED" as const, assignable: false, book: updatedBooks.get(row.book.id) ?? row.book, updatedAt: detail.assignment.updatedAt } : row);
      cache.setQueryData(key, { ...data, rows, total: Math.max(0, data.total - (status === "AVAILABLE" ? removed : 0)) });
      if (!rows.length && data.page > 1) setPage(data.page - 1);
    }
    const stockScope = `${account.id}:books:`;
    const stockParams = new URLSearchParams({ search: cache.read(`${stockScope}search`, "").trim(), editionId: cache.read(`${stockScope}edition`, ""),
      bookType: cache.read(`${stockScope}type`, "ALL"), tokenValue: cache.read(`${stockScope}token`, ""), page: String(cache.read(`${stockScope}page`, 1)) }).toString();
    const stockKey = `${stockScope}query:${stockParams}`; const stock = cache.entry(stockKey).state.data as BooksPage | undefined;
    if (stock) cache.setQueryData(stockKey, { ...stock, rows: stock.rows.map((book) => updatedBooks.get(book.id) ?? book) });
    setOpen(false); setSelected([]); setNotice(detail.assignment.number); setViewing(detail.assignment.id);
  }
  return <AppShell account={account} headerTitle="leftoversScreen" sampleData={false} search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("leftoversScreen")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("leftoversDescription")}</p></div>
      <div className={"header-actions flex items-center gap-[12px]"}><Button asChild variant="outline"><Link href="/books/assignments">{t("assignBooks")}</Link></Button>
        <Button disabled={!selected.length} onClick={() => setOpen(true)}>{t("leftoversAssignSelected")} ({selected.length})</Button></div></div>
    {notice && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"} role="status">{t("assignSaved")} <strong>{notice}</strong></p>}
    <Card className={"assignment-filters grid grid-cols-[minmax(180px,_1fr)_180px_42px] items-center gap-[12px] p-[18px] max-[650px]:grid-cols-[minmax(0,_1fr)_42px] max-[650px]:[&_>_.input:first-child]:col-[1_/_-1]"}><Input type="search" value={search} maxLength={100} placeholder={t("leftoversSearch")} aria-label={t("search")}
      onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} aria-label={t("status")} value={status} onChange={(event) => {
        const value = event.target.value; if (value === "ALL" || value === "AVAILABLE" || value === "ASSIGNED" || value === "HELD") { setStatus(value); setPage(1); }
      }}><option value="AVAILABLE">{t("leftoversAvailable")}</option><option value="ASSIGNED">{t("booksAssigned")}</option><option value="HELD">{t("leftoversHeld")}</option><option value="ALL">{t("booksAllOptions")}</option></select>
      <Button variant="outline" size="icon" loading={query.loading} aria-label={t("usersRefresh")} onClick={() => cache.invalidate(`${scope}query:`)}><RefreshCw size={17} /></Button></Card>
    <div className={"books-results flex items-center justify-between gap-[15px] text-[length:12px] min-h-[22px] my-[22px_14px]"}><span>{t("leftoversScreen")} {data?.total ?? 0} · {t("leftoversSelected")}: {selected.length}/150</span>
      {loading && <span className={"muted text-[color:var(--muted-foreground)]"} role="status">{t(data ? "usersUpdating" : "working")}</span>}</div>
    {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] error"} role="alert">{t(booksError(query.error))}</p>}
    {data && data.rows.length > 0 && <Card className={"books-table-card overflow-hidden [&_.table-container]:mt-0 [&_.books-table_:is(th,_td)]:p-[15px_16px] [&_.books-table_:is(th,_td)]:text-start [&_.books-table_:is(th,_td)]:align-middle [&_.books-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_.books-table_:is(th,_td):first-child]:ps-[20px] [&_.books-table_:is(th,_td):last-child]:pe-[20px] [&_.books-stock-table_:is(th,_td):nth-child(n+5)]:text-center"}><div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6] leftovers-table min-w-[1120px] [table-layout:fixed] [&_:is(th,_td):first-child]:text-center [&_:is(th,_td):nth-child(6)]:text-center [&_:is(th,_td):last-child]:text-center [&_input[type='checkbox']]:[accent-color:var(--primary)] [&_input[type='checkbox']]:w-[16px] [&_input[type='checkbox']]:h-[16px] [&_input[type='checkbox']]:cursor-pointer [&_input:disabled]:cursor-default"}>
      <colgroup><col style={{ width: "4%" }} /><col style={{ width: "22%" }} /><col style={{ width: "18%" }} /><col style={{ width: "12%" }} /><col style={{ width: "14%" }} /><col style={{ width: "8%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /></colgroup>
      <thead><tr><th scope="col">{t("leftoversSelect")}</th><th scope="col">{t("leftoversCode")}</th><th scope="col">{t("leftoversReturnedBy")}</th><th scope="col">{t("returnsDate")}</th>
        <th scope="col">{t("booksReceiptRange")}</th><th scope="col">{t("returnsRemaining")}</th><th scope="col">{t("status")}</th><th scope="col">{t("leftoversAssign")}</th></tr></thead>
      <tbody>{data.rows.map((row) => <LeftoverTableRow key={row.id} row={row} checked={selected.some((item) => item.id === row.id)}
        blocked={!selected.some((item) => item.id === row.id) && (selected.length >= 150 || selected.some((item) => item.book.id === row.book.id))} onToggle={toggle} onAssign={assign} />)}</tbody></table></div></Card>}
    {!loading && data?.rows.length === 0 && <Card className={"users-empty p-[44px_20px] text-center text-[color:var(--muted-foreground)]"}>{t("leftoversEmpty")}</Card>}
    {data && <div className={"books-pagination flex items-center justify-between gap-[15px] text-[length:12px] pt-[22px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className={"header-actions flex items-center gap-[12px]"}>
      <Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
      <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={open} busy={busy} onOpenChange={setOpen} className={"assignment-editor-dialog w-[min(980px,_calc(100vw_-_32px))]"} title={t("leftoversAssignTitle")} description={t("leftoversFormHelp")}>
      {open && <AssignmentForm account={account} initialId="" initialCode="" leftovers={selected} onBusyChange={setBusy} onSaved={saved} />}</Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }} className={"assignment-slip-dialog w-[min(980px,_calc(100vw_-_32px))]"} title={t("assignSlip")} description={t("assignSlipHelp")}>
      {viewing && <AssignmentSlipView key={viewing} accountId={account.id} id={viewing} />}</Dialog>
  </AppShell>;
}
