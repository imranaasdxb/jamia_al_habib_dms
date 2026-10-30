"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Award, ClipboardCheck, RefreshCw, Search, ChevronRight, BookX } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { indiaToday } from "@/modules/books/assignments.schema";
import { bookLossResponseSchema, displayMoney, openReturnsResponseSchema, returnsResponseSchema } from "@/modules/books/returns.schema";
import { ReturnForm } from "@/modules/books/components/return-form";
import { AuthorizationCertificateView } from "@/modules/books/components/authorization-certificate";
import type { Account } from "@/modules/auth/auth.types";
import type { OpenReturnCase, ReturnRow } from "@/modules/books/returns.schema";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CertificateScope } from "@/modules/books/certificates.schema";

function submissionBookNumber(row: OpenReturnCase) {
  const edition = row.book.editionNumber === null ? "" : `ED-${String(row.book.editionNumber).padStart(2, "0")}-`;
  const start = row.book.bookNumber.match(/\/(\d+)$/)?.[1] ?? row.book.receiptFrom;
  const book = row.book.editionBookNumber === null ? row.book.bookNumber.replace(/^BOOK/i, "Book")
    : `Book${row.book.editionBookNumber}/${start}`;
  const token = row.book.bookType === "TOKEN" && row.book.tokenValuePaise !== null ? `T-${row.book.tokenValuePaise / 100}-` : "";
  return `${edition}${token}${book}`;
}

function FundraiserCertificateAction({ rows, onView }: { rows: OpenReturnCase[]; onView: (id: string, fundraiserId: string) => void }) {
  const { t } = useLanguage(); const first = rows[0]?.assignment;
  return <div className="flex flex-wrap items-center gap-2 border-t border-primary/10 bg-accent/20 px-4 py-2">
    <span className="text-[11px] font-medium text-muted-foreground">{t("certificateFundraiser")}</span>
    <Button size="small" variant="outline" className="ms-auto" disabled={!first} onClick={() => { if (first) onView(first.id, first.collectorId); }}><Award size={15} aria-hidden="true" />{t("certificateView")}</Button>
  </div>;
}

export function ReturnsScreen({ account }: { account: Account }) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const router = useRouter(); const scope = `${account.id}:returns:`;
  const [search, setSearch] = usePageState(`${scope}search`, ""); const [page, setPage] = usePageState(`${scope}page`, 1);
  const [tab, setTab] = usePageState<"OPEN" | "RETURNED">(`${scope}tab`, "OPEN");
  const [collectorId, setCollector] = usePageState(`${scope}collector`, ""); const [overdue, setOverdue] = usePageState(`${scope}overdue`, "ALL");
  const [current, setCurrent] = useState<OpenReturnCase | null>(null); const [busy, setBusy] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<{ assignmentId: string; scope: CertificateScope; fundraiserId?: string } | null>(null);
  const [lostBook, setLostBook] = useState<OpenReturnCase | null>(null);
  const [lossReason, setLossReason] = useState(""); const [markingLost, setMarkingLost] = useState(false);
  const [lossError, setLossError] = useState<MessageKey | null>(null); const [lossNotice, setLossNotice] = useState(false);
  const params = new URLSearchParams({ search: search.trim(), tab, collectorId, overdue, page: String(page) }).toString();
  const load = useCallback(async () => {
    const payload = await booksRequest(`/api/v1/book-returns?${params}`);
    return tab === "OPEN" ? openReturnsResponseSchema.parse(payload) : returnsResponseSchema.parse(payload);
  }, [params, tab]);
  const queryKey = `${scope}${tab === "OPEN" ? "open:receipt-totals-v1" : "returned"}:${params}`;
  const query = usePageQuery(queryKey, load, { enabled: !current && !lostBook && !viewingCertificate, delay: search ? 300 : 0 });
  const data = query.data; const rows = tab === "OPEN" ? data?.data as OpenReturnCase[] | undefined : undefined;
  const fundraiserTotals = new Map((data && "fundraiserTotals" in data.meta ? data.meta.fundraiserTotals : [])
    .map((totals) => [totals.collectorId, totals]));
  const groups = new Map<string, OpenReturnCase[]>();
  rows?.forEach((row) => groups.set(row.assignment.collectorId, [...(groups.get(row.assignment.collectorId) ?? []), row]));
  function saved(row: ReturnRow) {
    cache.invalidate(`${account.id}:edition-summary:`);
    cache.invalidate(`${scope}open:`); cache.invalidate(`${scope}returned:`); cache.invalidate(`${account.id}:receipts:queue:query:`);
    setCurrent(null); router.push(`/receipt-entry/${row.id}`);
  }
  async function markLost() {
    if (!lostBook || lostBook.submissionId || markingLost || lossReason.trim().length < 3 || lossReason.trim().length > 1000) return;
    setMarkingLost(true); setLossError(null);
    try {
      const result = bookLossResponseSchema.parse(await booksRequest("/api/v1/book-returns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_BOOK_LOST", caseId: lostBook.id, reason: lossReason.trim() }),
      })).data;
      cache.invalidate(`${scope}open:`);
      if (tab === "OPEN" && data) {
        cache.setQueryData(queryKey, { ...data, data: (data.data as OpenReturnCase[])
          .filter((row) => row.id !== result.caseId).map((row) => row.assignment.id === result.assignmentId
            ? { ...row, assignment: { ...row.assignment, openCount: Math.max(0, row.assignment.openCount - 1) } } : row),
          meta: { ...data.meta, total: Math.max(0, data.meta.total - 1) } });
        if (data.data.length === 1 && page > 1) setPage(page - 1);
      }
      cache.invalidate(`${account.id}:books:query:`); cache.invalidate(`${account.id}:assignments:query:`);
      cache.invalidate(`${account.id}:edition-summary:`);
      cache.invalidate(`${account.id}:assignments:detail:${result.assignmentId}`); cache.invalidate(`${account.id}:leftovers:`);
      setLostBook(null); setLossReason(""); setLossNotice(true);
    } catch (error) { setLossError(booksError(error)); }
    finally { setMarkingLost(false); }
  }
  return <AppShell account={account} headerTitle="returnsScreen" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">{t("returnsScreen")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("submissionDescription")}</p></div>
      <Button asChild variant="outline"><Link href="/books/assignments">{t("assignBooks")}</Link></Button></div>
    <div className="mb-4 flex gap-2">{(["OPEN", "RETURNED"] as const).map((value) => <Button key={value} variant={tab === value ? "default" : "outline"} onClick={() => { setTab(value); setPage(1); setCollector(""); }}>
      {t(value === "OPEN" ? "submissionAssigned" : "submissionHistory")}</Button>)}</div>
    <Card className="mb-5 flex flex-wrap items-center gap-3 p-4"><div className="relative min-w-60 flex-1"><Search className="absolute start-3 top-3.5 text-muted-foreground" size={17} />
      <Input type="search" className="ps-10" maxLength={100} placeholder={t("returnsSearch")} value={search} aria-label={t("search")} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
      {tab === "OPEN" && <select className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm" aria-label={t("status")} value={overdue} onChange={(event) => { setOverdue(event.target.value); setPage(1); }}>
        <option value="ALL">{t("booksAllOptions")}</option><option value="OVERDUE">{t("assignOverdue")}</option></select>}
      {collectorId && <Button variant="outline" onClick={() => { setCollector(""); setPage(1); }}>{t("submissionAllFundraisers")}</Button>}
      <Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(`${scope}${tab === "OPEN" ? "open" : "returned"}:`)}><RefreshCw size={17} /></Button></Card>
    {query.error != null && <p className="mb-4 text-sm text-[var(--danger)]" role="alert">{t(booksError(query.error))}</p>}
    {lossNotice && <p className="mb-4 rounded-xl bg-accent px-4 py-3 text-sm text-primary" role="status">{t("bookLostSuccess")}</p>}
    {!data && query.loading && <p role="status" className="text-sm text-muted-foreground">{t("working")}</p>}
    <div className="space-y-4">{[...groups].map(([id, assigned]) => { const first = assigned[0]; if (!first) return null; const profile = first.assignment; const totals = fundraiserTotals.get(id); return <Card key={id} className="overflow-hidden">
      <button type="button" className="flex w-full items-center gap-3 bg-accent/40 p-4 text-start transition-colors hover:bg-accent" onClick={() => { setCollector(id); setPage(1); }}>
        <span className="flex size-12 items-center justify-center overflow-hidden rounded-full bg-accent text-xl font-semibold text-primary">{first.hasPhoto ? <img alt="" className="size-full object-cover" src={`/api/v1/people/${id}/photo`} /> : profile.collectorName.slice(0, 1)}</span>
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{profile.collectorName}</strong><span className="mt-1 block text-xs text-muted-foreground">{profile.collectorCode}{profile.phone && ` · ${profile.phone}`}</span></span>
        <span className="flex shrink-0 flex-wrap justify-end gap-x-5 gap-y-2 text-end" title={t("submissionAllBookTotals")}>
          <span><span className="block text-[10px] text-muted-foreground">{t("returnsTotal")}</span><strong className="mt-1 block text-sm tabular-nums text-primary">{displayMoney(totals?.collectedPaise ?? 0, language)}</strong></span>
          <span><span className="block text-[10px] text-muted-foreground">{t("returnsCommissionAmount")}</span><strong className="mt-1 block text-sm tabular-nums">{displayMoney(totals?.collectedCommissionPaise ?? 0, language)}</strong></span>
        </span><ChevronRight size={17} className="shrink-0" /></button>
      <FundraiserCertificateAction rows={assigned} onView={(assignmentId, fundraiserId) => setViewingCertificate({ assignmentId, fundraiserId, scope: "FUNDRAISER" })} />
      <div className="overflow-x-auto"><table className="w-full text-start text-xs [&_th]:bg-muted/50 [&_th]:p-3 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:p-3">
        <thead><tr><th>{t("booksNumber")}</th><th>{t("assignNumber")}</th><th className="whitespace-nowrap">{t("returnsTotal")}</th><th className="whitespace-nowrap">{t("returnsCommissionAmount")}</th><th>{t("status")}</th><th>{t("usersActions")}</th></tr></thead>
        <tbody>{assigned.map((row) => <tr key={row.id}><td><strong className="block whitespace-nowrap font-semibold" dir="ltr" title={row.sourceCode}>{submissionBookNumber(row)}</strong><span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">{t("booksReceiptRange")}: <bdi dir="ltr">{row.book.receiptFrom}–{row.book.receiptTo}</bdi></span></td>
          <td><span className="block whitespace-nowrap">{row.assignment.number}</span><span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">{t("assignReturnDate")}: {row.assignment.expectedReturnDate}</span></td>
          <td className="whitespace-nowrap font-semibold tabular-nums text-primary">{row.enteredReceiptCount > 0 ? displayMoney(row.collectedPaise, language) : "—"}</td>
          <td className="whitespace-nowrap font-semibold tabular-nums">{row.enteredReceiptCount > 0 ? displayMoney(row.collectedCommissionPaise, language) : "—"}</td>
          <td><Badge tone={row.submissionId ? "warning" : row.assignment.expectedReturnDate < indiaToday() ? "danger" : "neutral"}>{t(row.submissionId ? "submissionInProgress" : row.assignment.expectedReturnDate < indiaToday() ? "assignOverdue" : "booksAssigned")}</Badge></td>
          <td><div className="flex flex-wrap items-center gap-2">{row.submissionId ? <Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.submissionId}`}>{t("submissionResume")}</Link></Button>
            : <Button size="small" variant="outline" disabled={markingLost} onClick={() => setCurrent(row)}><ClipboardCheck size={15} />{t("submissionStart")}</Button>}
            <Button size="small" variant="outline" className="text-[var(--danger)] hover:bg-[var(--danger-soft)]" disabled={Boolean(row.submissionId) || markingLost}
              title={row.submissionId ? t("bookLostStarted") : undefined} onClick={() => { setLostBook(row); setLossReason(""); setLossError(null); setLossNotice(false); }}>
              <BookX size={15} aria-hidden="true" />{t("bookMarkLost")}</Button>
          </div></td></tr>)}</tbody></table></div></Card>; })}</div>
    {tab === "RETURNED" && <div className="grid gap-3">{(data?.data as ReturnRow[] | undefined)?.map((row) => <Card key={row.id} className="flex flex-wrap items-center gap-4 p-4"><div className="min-w-40 flex-1"><strong className="block text-sm">{row.collectorName}</strong><span className="mt-1 block text-xs text-muted-foreground">{row.sourceCode} · {row.number} · {row.returnDate}</span></div>
      <strong className="text-primary">{displayMoney(row.totalPaise, language)}</strong><Badge tone={row.receiptEntryStatus === "FLAGGED" ? "danger" : row.receiptEntryStatus === "RECONCILED" ? "success" : "warning"}>{t(row.receiptEntryStatus === "FLAGGED" ? "booksFlagged" : row.receiptEntryStatus === "RECONCILED" ? "returnsReconciled" : "submissionInProgress")}</Badge>
      <Button size="small" variant="outline" onClick={() => setViewingCertificate({ assignmentId: row.assignmentId, scope: "ASSIGNMENT" })}><Award size={15} aria-hidden="true" />{t("certificateView")}</Button>
      <Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.id}`}>{t("submissionResume")}</Link></Button></Card>)}</div>}
    {data?.data.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">{t("returnsEmptyOpen")}</Card>}
    {data && <div className="flex items-center justify-between py-5 text-xs"><span>{t("usersPage")} {data.meta.page}/{Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize))} · {data.meta.total}</span><div className="flex gap-2">
      <Button size="small" variant="outline" disabled={query.loading || page <= 1} onClick={() => setPage(page - 1)}>{t("usersPrevious")}</Button><Button size="small" variant="outline" disabled={query.loading || page * data.meta.pageSize >= data.meta.total} onClick={() => setPage(page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={current !== null} busy={busy} onOpenChange={(open) => { if (!open) setCurrent(null); }} title={t("submissionStart")} description={t("submissionDraftHelp")} className="w-[min(820px,calc(100vw-2rem))]">
      {current && <ReturnForm key={current.id} account={account} current={current} onBusyChange={setBusy} onSaved={saved} />}</Dialog>
    <Dialog open={viewingCertificate !== null} onOpenChange={(open) => { if (!open) setViewingCertificate(null); }} title={t("certificateTitle")} description={t(viewingCertificate?.scope === "FUNDRAISER" ? "certificateFundraiserHelp" : "certificateHelp")} className="w-[min(900px,calc(100vw-2rem))]">
      {viewingCertificate && <AuthorizationCertificateView key={`${viewingCertificate.scope}:${viewingCertificate.fundraiserId ?? viewingCertificate.assignmentId}`} accountId={account.id} {...viewingCertificate} />}
    </Dialog>
    <Dialog open={lostBook !== null} busy={markingLost} onOpenChange={(open) => { if (!open) setLostBook(null); }} title={t("bookMarkLost")} description={t("bookLostHelp")}>
      {lostBook && <div className="space-y-4">
        <div className="rounded-xl bg-muted p-3 text-sm"><strong>{submissionBookNumber(lostBook)}</strong><p className="mt-1 text-xs text-muted-foreground">{lostBook.assignment.collectorName} · {lostBook.assignment.number} · {lostBook.book.receiptFrom}–{lostBook.book.receiptTo}</p></div>
        <div><label className="mb-2 block text-xs font-semibold" htmlFor="book-loss-reason">{t("bookLostReason")} *</label>
          <textarea id="book-loss-reason" className="w-full rounded-xl border border-border bg-card p-3 text-sm" rows={4} minLength={3} maxLength={1000} required disabled={markingLost} value={lossReason} onChange={(event) => setLossReason(event.target.value)} /></div>
        {lossError && <p className="text-xs text-[var(--danger)]" role="alert">{t(lossError)}</p>}
        <div className="flex justify-end"><Button className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90" loading={markingLost} disabled={lossReason.trim().length < 3 || lossReason.trim().length > 1000} onClick={() => { void markLost(); }}>{t("bookMarkLost")}</Button></div>
      </div>}
    </Dialog>
  </AppShell>;
}
