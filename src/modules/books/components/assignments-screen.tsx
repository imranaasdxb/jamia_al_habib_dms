"use client";
import Link from "next/link";
import { memo, useCallback, useState } from "react";
import { Eye, Plus, RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { assignmentsResponseSchema, indiaToday } from "@/modules/books/assignments.schema";
import { AssignmentForm } from "@/modules/books/components/assignment-form";
import { AssignmentSlipView } from "@/modules/books/components/assignment-slip";
import type { Account } from "@/modules/auth/auth.types";
import type { AssignmentDetail, AssignmentQuery, AssignmentRow, AssignmentsPage } from "@/modules/books/assignments.schema";
import type { BooksPage } from "@/modules/books/books.schema";

function reconcile(previous: AssignmentsPage | undefined, next: AssignmentsPage) {
  const previousRows = new Map(previous?.rows.map((row) => [row.id, row]));
  return { ...next, rows: next.rows.map((row) => {
    const old = previousRows.get(row.id);
    return old && old.updatedAt === row.updatedAt && old.openCount === row.openCount ? old : row;
  }) };
}
const AssignmentTableRow = memo(function AssignmentTableRow({ row, onView, today }: { row: AssignmentRow; onView: (id: string) => void; today: string }) {
  const { t } = useLanguage(); const overdue = row.openCount > 0 && row.expectedReturnDate < today;
  return <tr><td><strong>{row.number}</strong><span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{row.assignmentDate}</span></td>
    <td>{row.collectorName}<span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{row.collectorCode}</span></td><td>{row.bookIds.length}</td><td>{row.expectedReturnDate}</td>
    <td><Badge tone={overdue ? "danger" : row.openCount > 0 ? "warning" : "success"}>{t(overdue ? "assignOverdue" : row.openCount > 0 ? "assignOpen" : "booksClosed")}</Badge>
      <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{t("assignOpenBooks")}: {row.openCount}</span></td><td>{row.assignedByName}</td>
    <td><Button variant="ghost" size="icon" aria-label={`${t("assignViewSlip")} ${row.number}`} onClick={() => onView(row.id)}><Eye size={17} /></Button></td></tr>;
});
export function AssignmentsScreen({ account, initialId = "", initialCode = "" }: { account: Account; initialId?: string; initialCode?: string }) {
  const { t } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:assignments:`;
  const [search, setSearch] = usePageState(`${scope}search`, ""); const [status, setStatus] = usePageState<AssignmentQuery["status"]>(`${scope}status`, "ALL");
  const [page, setPage] = usePageState(`${scope}page`, 1); const [open, setOpen] = useState(Boolean(initialId));
  const [busy, setBusy] = useState(false); const [viewing, setViewing] = useState<string | null>(null); const [savedNumber, setSavedNumber] = useState("");
  const params = new URLSearchParams({ search: search.trim(), status, collectorId: "", page: String(page) }).toString();
  const fetchData = useCallback(async (): Promise<AssignmentsPage> => {
    const result = assignmentsResponseSchema.parse(await booksRequest(`/api/v1/book-assignments?${params}`)); return { rows: result.data, ...result.meta };
  }, [params]);
  const queryKey = `${scope}query:${params}`;
  const query = usePageQuery(queryKey, fetchData, { enabled: !open, delay: search ? 300 : 0, reconcile });
  const data = query.data; const loading = query.loading || query.stale;
  const view = useCallback((id: string) => setViewing(id), []);
  function saved(detail: AssignmentDetail, replayed: boolean) {
    cache.setQueryData(`${scope}detail:${detail.assignment.id}`, detail);
    cache.invalidate(`${scope}query:`); cache.invalidate(`${scope}stock:`); cache.invalidate(`${account.id}:books:query:`);
    cache.invalidate(`${account.id}:returns:open:`);
    const row = detail.assignment;
    const overdue = row.expectedReturnDate < indiaToday();
    const term = search.trim().toLowerCase();
    const matches = [row.number, row.collectorName, row.collectorCode, row.phone].some((value) => value.toLowerCase().includes(term))
      && (status === "ALL" || status === "OPEN" || (status === "OVERDUE" && overdue));
    if (data && !replayed) cache.setQueryData(queryKey, { ...data, total: data.total + (matches ? 1 : 0),
      overdue: data.overdue + (matches && overdue ? 1 : 0), rows: matches && data.page === 1 ? [row, ...data.rows].slice(0, data.pageSize) : data.rows });
    const stockScope = `${account.id}:books:`;
    const stockParams = new URLSearchParams({ search: cache.read(`${stockScope}search`, "").trim(), editionId: cache.read(`${stockScope}edition`, ""),
      bookType: cache.read(`${stockScope}type`, "ALL"), tokenValue: cache.read(`${stockScope}token`, ""), page: String(cache.read(`${stockScope}page`, 1)) }).toString();
    const stockKey = `${stockScope}query:${stockParams}`;
    const stock = cache.entry(stockKey).state.data as BooksPage | undefined;
    if (stock) {
      const updated = new Map(detail.books.map((book) => [book.id, book]));
      cache.setQueryData(stockKey, { ...stock, rows: stock.rows.map((book) => updated.get(book.id) ?? book) });
    }
    setOpen(false); setSavedNumber(detail.assignment.number); setViewing(detail.assignment.id);
  }
  return <AppShell account={account} headerTitle="assignBooks" sampleData={false} search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("assignBooks")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("assignDescription")}</p></div>
      <div className={"header-actions flex items-center gap-[12px]"}><Button asChild variant="outline"><Link href="/books">{t("booksStock")}</Link></Button>
        <Button asChild variant="outline"><Link href="/books/returns">{t("returnsScreen")}</Link></Button>
        {account.role === "ADMIN" && <Button asChild variant="outline"><Link href="/books/leftovers">{t("leftoversScreen")}</Link></Button>}
        <Button onClick={() => setOpen(true)}><Plus size={18} />{t("assignNew")}</Button></div></div>
    {savedNumber && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"} role="status">{t("assignSaved")} <strong>{savedNumber}</strong></p>}
    <Card className={"assignment-filters grid grid-cols-[minmax(180px,_1fr)_180px_42px] items-center gap-[12px] p-[18px] max-[650px]:grid-cols-[minmax(0,_1fr)_42px] max-[650px]:[&_>_.input:first-child]:col-[1_/_-1]"}><Input type="search" maxLength={100} aria-label={t("search")} placeholder={t("assignSearch")} value={search}
      onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} aria-label={t("status")} value={status} onChange={(event) => {
        const value = event.target.value; if (value === "ALL" || value === "OPEN" || value === "OVERDUE" || value === "CLOSED") { setStatus(value); setPage(1); }
      }}><option value="ALL">{t("booksAllOptions")}</option><option value="OPEN">{t("assignOpen")}</option><option value="OVERDUE">{t("assignOverdue")}</option><option value="CLOSED">{t("booksClosed")}</option></select>
      <Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(`${scope}query:`)}><RefreshCw size={17} /></Button></Card>
    <div className={"books-results flex items-center justify-between gap-[15px] text-[length:12px] min-h-[22px] my-[22px_14px]"}><span>{t("assignRecords")} {data?.total ?? 0}</span>{loading && <span className={"muted text-[color:var(--muted-foreground)]"} role="status">{t(data ? "usersUpdating" : "working")}</span>}</div>
    {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] error"} role="alert">{t(booksError(query.error))}</p>}
    {data && data.rows.length > 0 && <Card className={"books-table-card overflow-hidden [&_.table-container]:mt-0 [&_.books-table_:is(th,_td)]:p-[15px_16px] [&_.books-table_:is(th,_td)]:text-start [&_.books-table_:is(th,_td)]:align-middle [&_.books-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_.books-table_:is(th,_td):first-child]:ps-[20px] [&_.books-table_:is(th,_td):last-child]:pe-[20px] [&_.books-stock-table_:is(th,_td):nth-child(n+5)]:text-center"}><div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6] assignment-table min-w-[950px] [table-layout:fixed] [&_:is(th,_td):nth-child(3)]:text-center [&_:is(th,_td):last-child]:text-center"}>
      <colgroup><col style={{ width: "20%" }} /><col style={{ width: "20%" }} /><col style={{ width: "8%" }} /><col style={{ width: "14%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /><col style={{ width: "8%" }} /></colgroup>
      <thead><tr><th scope="col">{t("assignNumber")}</th><th scope="col">{t("peopleCollectors")}</th><th scope="col">{t("assignBookCount")}</th>
        <th scope="col">{t("assignReturnDate")}</th><th scope="col">{t("status")}</th><th scope="col">{t("assignBy")}</th><th scope="col">{t("assignViewSlip")}</th></tr></thead>
      <tbody>{data.rows.map((row) => <AssignmentTableRow key={row.id} row={row} onView={view} today={indiaToday()} />)}</tbody></table></div></Card>}
    {!loading && data?.rows.length === 0 && <Card className={"users-empty p-[44px_20px] text-center text-[color:var(--muted-foreground)]"}>{t("assignEmpty")}</Card>}
    {data && <div className={"books-pagination flex items-center justify-between gap-[15px] text-[length:12px] pt-[22px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className={"header-actions flex items-center gap-[12px]"}>
      <Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
      <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={open} busy={busy} onOpenChange={setOpen} className={"assignment-editor-dialog w-[min(980px,_calc(100vw_-_32px))]"} title={t("assignNew")} description={t("assignFormHelp")}>
      {open && <AssignmentForm account={account} initialId={initialId} initialCode={initialCode} onBusyChange={setBusy} onSaved={saved} />}</Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }} className={"assignment-slip-dialog w-[min(980px,_calc(100vw_-_32px))]"} title={t("assignSlip")} description={t("assignSlipHelp")}>
      {viewing && <AssignmentSlipView key={viewing} accountId={account.id} id={viewing} />}</Dialog>
  </AppShell>;
}
