"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Award, BookOpen, ClipboardCheck, Clock3, CircleAlert, Search, ChevronRight, BookX, Users } from "lucide-react";
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
import { BookExportButton } from "@/modules/books/components/book-export-button";
import { HistoricalCollections } from "@/modules/books/components/historical-collections";
import { receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { receiptBookResponseSchema } from "@/modules/receipts/receipts.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { OpenReturnCase, ReturnRow, ReturnQuery, ReturnListSummary, ReturnEditionOption } from "@/modules/books/returns.schema";
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
  const { t } = useLanguage(); const first = rows.find((row) => row.submissionStatus !== "CLOSED")?.assignment;
  if (!first) return null;
  return <div className="flex flex-wrap items-center gap-2 border-t border-primary/10 bg-accent/20 px-4 py-2">
    <span className="text-[11px] font-medium text-muted-foreground">{t("certificateFundraiser")}</span>
    <Button size="small" variant="outline" className="ms-auto" onClick={() => onView(first.id, first.collectorId)}><Award size={15} aria-hidden="true" />{t("certificateView")}</Button>
  </div>;
}

function SubmissionSummary({ summary, tab, status, onStatusChange }: { summary: ReturnListSummary | undefined; tab: "OPEN" | "RETURNED";
  status: ReturnQuery["status"]; onStatusChange: (status: ReturnQuery["status"]) => void }) {
  const { t, language } = useLanguage();
  const number = new Intl.NumberFormat(language === "ur" ? "ur-IN" : "en-IN");
  const cards = tab === "OPEN" ? [
    { label: "submissionAssigned", value: summary?.records, icon: BookOpen, detail: "submissionSummaryBooksHelp" },
    { label: "peopleCollectors", value: summary?.fundraisers, icon: Users, detail: "submissionSummaryFundraisersHelp" },
    { label: "submissionInProgress", value: summary?.inProgress, icon: ClipboardCheck, detail: "submissionSummaryProgressHelp" },
    { label: "assignOverdue", value: summary?.overdue, icon: Clock3, detail: "submissionSummaryOverdueHelp" },
  ] as const : [
    { label: "submissionHistory", value: summary?.records, icon: BookOpen, detail: "submissionSummaryHistoryHelp" },
    { label: "peopleCollectors", value: summary?.fundraisers, icon: Users, detail: "submissionSummaryFundraisersHelp" },
    { label: "returnsReconciled", value: summary?.completed, icon: ClipboardCheck, detail: "submissionSummaryReconciledHelp" },
    { label: "booksFlagged", value: summary?.flagged, icon: CircleAlert, detail: "submissionSummaryFlaggedHelp" },
  ] as const;
  const progressFilters = [
    { status: "IN_PROGRESS", label: "submissionInProgress", value: summary?.inProgress },
    { status: "CLOSED", label: "booksClosed", value: summary?.closed },
    { status: "REOPENED", label: "submissionStatusReopened", value: summary?.reopened },
  ] as const;
  return <section className="mb-5" aria-label={t("submissionListSummary")} aria-busy={!summary}>
    <p className="mb-3 text-[11px] text-muted-foreground">{t("submissionSummaryScope")}
      {summary && tab === "OPEN" && <span className="ms-2">{t("submissionNotStarted")}: {number.format(summary.notStarted ?? 0)}</span>}
      {summary && tab === "RETURNED" && <span className="ms-2">{t("submissionInProgress")}: {number.format(summary.inProgress)}</span>}
    </p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, detail }, i) =>
      <div key={label} className={`min-w-0 rounded-2xl border p-4 ${i === 0 ? "border-emerald-200 bg-emerald-50/80 text-emerald-950" : "border-border bg-card"}`}>
        <div className="flex items-start justify-between gap-3"><span className="text-[11px] font-medium leading-relaxed">{t(label)}</span>
          <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${i === 0 ? "bg-emerald-100 text-emerald-700" : i === 3 ? "bg-amber-50 text-amber-700" : "bg-muted text-primary"}`}><Icon size={17} aria-hidden="true" /></span></div>
        {tab === "OPEN" && label === "submissionInProgress" ? <div className="mt-2 grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
          {progressFilters.map((item) => <button key={item.status} type="button" disabled={!summary} aria-pressed={status === item.status}
            className="min-w-0 px-1.5 py-1.5 text-center text-[10px] leading-tight hover:bg-accent aria-pressed:bg-accent aria-pressed:text-primary"
            onClick={() => onStatusChange(status === item.status ? "ALL" : item.status)}>
            <span className="block text-lg font-bold tabular-nums">{summary ? number.format(item.value ?? 0) : "—"}</span>{t(item.label)}
          </button>)}
        </div> : summary ? <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{number.format(value ?? 0)}</p>
          : <div className="mt-2 h-7 w-20 animate-pulse rounded bg-muted motion-reduce:animate-none" />}
        {!(tab === "OPEN" && label === "submissionInProgress") && <p className="mt-1 text-[10px] leading-relaxed opacity-65">{t(detail)}</p>}
      </div>)}</div>
  </section>;
}

function SubmissionListSkeleton() {
  const { t } = useLanguage();
  return <div className="space-y-4" role="status" aria-label={t("working")}>{Array.from({ length: 2 }, (_, i) =>
    <Card key={i} className="overflow-hidden" aria-hidden="true">
      <div className="flex items-center gap-3 bg-accent/30 p-4"><div className="size-12 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="flex-1 space-y-2"><div className="h-3.5 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div></div>
      {Array.from({ length: 3 }, (_, j) => <div key={j} className="grid grid-cols-6 gap-6 border-t border-border p-4">
        {Array.from({ length: 6 }, (_, k) => <div key={k} className="h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />)}
      </div>)}
    </Card>)}</div>;
}

export function ReturnsScreen({ account }: { account: Account }) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const router = useRouter(); const scope = `${account.id}:returns:`;
  const [search, setSearch] = usePageState(`${scope}search`, ""); const [page, setPage] = usePageState(`${scope}page`, 1);
  const [tab, setTab] = usePageState<"OPEN" | "RETURNED">(`${scope}tab`, "OPEN");
  const [collectorId, setCollector] = usePageState(`${scope}collector`, ""); const [overdue, setOverdue] = usePageState<ReturnQuery["overdue"]>(`${scope}overdue`, "ALL");
  const [bookType, setBookType] = usePageState<ReturnQuery["bookType"]>(`${scope}book-type`, "ALL");
  const [editionId, setEdition] = usePageState(`${scope}edition`, "");
  const [status, setStatus] = usePageState<ReturnQuery["status"]>(`${scope}status`, "ALL");
  const [current, setCurrent] = useState<OpenReturnCase | null>(null); const [busy, setBusy] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<{ assignmentId: string; scope: CertificateScope; fundraiserId?: string } | null>(null);
  const [lostBook, setLostBook] = useState<OpenReturnCase | null>(null);
  const [lossReason, setLossReason] = useState(""); const [markingLost, setMarkingLost] = useState(false);
  const [lossError, setLossError] = useState<MessageKey | null>(null); const [lossNotice, setLossNotice] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<{ id: string; version: number; book: string } | null>(null);
  const [reopenReason, setReopenReason] = useState(""); const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<MessageKey | null>(null);
  const params = new URLSearchParams({ search: search.trim(), tab, collectorId, overdue, bookType, editionId, status, page: String(page) }).toString();
  const optionsKey = `${scope}${tab === "OPEN" ? "open" : "returned"}:edition-options:v2`;
  const subscribeOptions = useCallback((notify: () => void) => {
    const entry = cache.entry(optionsKey); entry.listeners.add(notify);
    return () => { entry.listeners.delete(notify); };
  }, [cache, optionsKey]);
  const optionsSnapshot = useCallback(() => cache.entry(optionsKey).state, [cache, optionsKey]);
  const optionsState = useSyncExternalStore(subscribeOptions, optionsSnapshot, optionsSnapshot);
  const editions = (optionsState.data as ReturnEditionOption[] | undefined) ?? [];
  const load = useCallback(async () => {
    const entry = cache.entry(optionsKey); const generation = entry.generation;
    const includeOptions = entry.state.data === undefined || entry.state.stale;
    const payload = await booksRequest(`/api/v1/book-returns?${params}&options=${includeOptions ? "1" : "0"}`);
    const result = tab === "OPEN" ? openReturnsResponseSchema.parse(payload) : returnsResponseSchema.parse(payload);
    if (result.meta.editions && entry.generation === generation) cache.setQueryData(optionsKey, result.meta.editions);
    return result;
  }, [cache, optionsKey, params, tab]);
  const queryKey = `${scope}${tab === "OPEN" ? "open" : "returned"}:profile-preview-v4:${params}`;
  const query = usePageQuery(queryKey, load, { enabled: !current && !lostBook && !viewingCertificate && !reopenTarget, delay: search ? 400 : 0 });
  const loading = query.loading || query.stale;
  const data = query.data; const rows = tab === "OPEN" ? data?.data as OpenReturnCase[] | undefined : undefined;
  const fundraiserTotals = new Map((data && "fundraiserTotals" in data.meta ? data.meta.fundraiserTotals : [])
    .map((totals) => [totals.collectorId, totals]));
  const groups = new Map<string, OpenReturnCase[]>();
  rows?.forEach((row) => groups.set(row.assignment.collectorId, [...(groups.get(row.assignment.collectorId) ?? []), row]));
  type OverviewState = Pick<ReturnQuery, "search" | "page" | "bookType" | "editionId" | "status" | "overdue">;
  function viewAllBooks(profile: OpenReturnCase["assignment"]) {
    cache.write(`${scope}overview-before-fundraiser`, { search, page, bookType, editionId, status, overdue } satisfies OverviewState);
    cache.write(`${scope}fundraiser-name:${profile.collectorId}`, profile.collectorName);
    setSearch(""); setBookType("ALL"); setEdition(""); setStatus("ALL"); setOverdue("ALL");
    setCollector(profile.collectorId); setPage(1);
  }
  function backToOverview() {
    const previous = cache.read<OverviewState>(`${scope}overview-before-fundraiser`, {
      search: "", page: 1, bookType: "ALL", editionId: "", status: "ALL", overdue: "ALL",
    });
    setCollector(""); setSearch(previous.search); setPage(previous.page); setBookType(previous.bookType);
    setEdition(previous.editionId); setStatus(previous.status); setOverdue(previous.overdue);
  }
  const focused = tab === "OPEN" && Boolean(collectorId);
  const fundraiserName = focused ? rows?.[0]?.assignment.collectorName
    || cache.read(`${scope}fundraiser-name:${collectorId}`, t("peopleCollector")) : "";
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
        const counts = "fundraiserTotals" in data.meta ? data.meta.fundraiserTotals : [];
        const removedProfile = counts.find((item) => item.collectorId === lostBook.assignment.collectorId)?.matchingBookCount === 1;
        const summary = data.meta.summary;
        cache.setQueryData(queryKey, { ...data, data: (data.data as OpenReturnCase[])
          .filter((row) => row.id !== result.caseId).map((row) => row.assignment.id === result.assignmentId
            ? { ...row, assignment: { ...row.assignment, openCount: Math.max(0, row.assignment.openCount - 1) } } : row),
          meta: { ...data.meta,
            total: Math.max(0, data.meta.total - (collectorId || removedProfile ? 1 : 0)),
            fundraiserTotals: counts.map((item) => item.collectorId === lostBook.assignment.collectorId ? {
              ...item, assignedBookCount: Math.max(0, item.assignedBookCount - 1), matchingBookCount: Math.max(0, item.matchingBookCount - 1),
            } : item),
            ...(summary ? { summary: { ...summary, records: Math.max(0, summary.records - 1),
              fundraisers: Math.max(0, summary.fundraisers - (removedProfile ? 1 : 0)),
              notStarted: Math.max(0, (summary.notStarted ?? 0) - 1),
              overdue: Math.max(0, (summary.overdue ?? 0) - (lostBook.assignment.expectedReturnDate < indiaToday() ? 1 : 0)),
            } } : {}),
          } });
        if (data.data.length === 1 && page > 1) setPage(page - 1);
      }
      cache.invalidate(`${account.id}:books:query:`); cache.invalidate(`${account.id}:assignments:query:`);
      cache.invalidate(`${account.id}:edition-summary:`);
      cache.invalidate(`${account.id}:assignments:detail:${result.assignmentId}`); cache.invalidate(`${account.id}:leftovers:`);
      setLostBook(null); setLossReason(""); setLossNotice(true);
      cache.invalidate(queryKey);
    } catch (error) { setLossError(booksError(error)); }
    finally { setMarkingLost(false); }
  }
  function changeStatus(value: ReturnQuery["status"]) {
    setStatus(value); setOverdue("ALL"); setPage(1);
  }
  function confirmReopen(id: string | null, version: number | null | undefined, book: string) {
    if (!id || version == null || account.role !== "SUPER_ADMIN") return;
    setReopenReason(""); setReopenError(null); setReopenTarget({ id, version, book });
  }
  async function reopen() {
    if (!reopenTarget || account.role !== "SUPER_ADMIN" || reopening || reopenReason.trim().length < 3) return;
    setReopening(true); setReopenError(null);
    try {
      const { id, version } = reopenTarget;
      const { data: updated } = receiptBookResponseSchema.parse(await receiptRequest(`/api/v1/receipt-entry/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REOPEN", version, page: 1, reason: reopenReason.trim() }),
      }));
      for (const prefix of ["returns:", `receipts:book:${id}:`, "receipts:queue:", "receipts:donors:", "edition-summary:",
        "assignments:query:", `assignments:detail:${updated.header.returned.assignmentId}`, "books:query:", "leftovers:", "flags:"]) {
        cache.invalidate(`${account.id}:${prefix}`);
      }
      setReopenTarget(null);
      router.push(`/receipt-entry/${id}`);
    } catch (error) { setReopenError(receiptError(error)); }
    finally { setReopening(false); }
  }
  return <AppShell account={account} headerTitle="returnsScreen" sampleData={false} search={search} onSearchChange={setSearch}
    backLabel={focused ? "submissionBackToMain" : undefined} onBack={focused ? backToOverview : undefined}>
    <div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">{focused ? fundraiserName : t("returnsScreen")}</h1><p className="mt-2 text-sm text-muted-foreground">{t(focused ? "submissionFundraiserBooksHelp" : "submissionDescription")}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline"><Link href="/books/assignments">{t("assignBooks")}</Link></Button>
      </div></div>
    <div className="mb-4 flex gap-2">{(["OPEN", "RETURNED"] as const).map((value) => <Button key={value} variant={tab === value ? "default" : "outline"} onClick={() => { setTab(value); setPage(1); setCollector(""); setStatus("ALL"); setOverdue("ALL"); setEdition(""); }}>
      {t(value === "OPEN" ? "submissionAssigned" : "submissionHistory")}</Button>)}</div>
    <Card className="mb-5 grid grid-cols-[minmax(180px,1.4fr)_minmax(110px,.7fr)_minmax(150px,1fr)_minmax(140px,.8fr)_auto] items-end gap-3 p-4 max-[1200px]:grid-cols-2">
      <div className="min-w-0"><label htmlFor="submission-search" className="mb-2 block text-xs font-semibold">{t("search")}</label><div className="relative"><Search className="absolute start-3 top-3.5 text-muted-foreground" size={17} aria-hidden="true" />
        <Input id="submission-search" type="search" className="ps-10" maxLength={100} placeholder={t("returnsSearch")} title={t("submissionSearchHelp")} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></div>
      <div className="min-w-0"><label htmlFor="submission-type" className="mb-2 block text-xs font-semibold">{t("mastersBookTypes")}</label>
        <select id="submission-type" className="min-h-[47px] w-full rounded-xl border border-border bg-card px-3 text-xs" value={bookType} onChange={(event) => {
          const value = event.target.value; if (value === "ALL" || value === "REGULAR" || value === "TOKEN") { setBookType(value); setEdition(""); setPage(1); }
        }}><option value="ALL">{t("booksAllOptions")}</option><option value="REGULAR">{t("booksRegular")}</option><option value="TOKEN">{t("booksToken")}</option></select></div>
      <div className="min-w-0"><label htmlFor="submission-edition" className="mb-2 block text-xs font-semibold">{t("mastersEditions")}</label>
        <select id="submission-edition" className="min-h-[47px] w-full rounded-xl border border-border bg-card px-3 text-xs" value={editionId} aria-busy={optionsState.loading || optionsState.stale} onChange={(event) => { setEdition(event.target.value); setPage(1); }}>
          <option value="">{t("booksAllOptions")}</option>{editions.filter((edition) => bookType === "ALL" || edition.bookType === bookType).map((edition) =>
            <option key={edition.id} value={edition.id}>{language === "ur" ? edition.nameUr : edition.nameEn}</option>)}</select></div>
      <div className="min-w-0"><label htmlFor="submission-status" className="mb-2 block text-xs font-semibold">{t("status")}</label>
        <select id="submission-status" className="min-h-[47px] w-full rounded-xl border border-border bg-card px-3 text-xs" value={tab === "OPEN" && overdue === "OVERDUE" && status === "ALL" ? "OVERDUE" : status} onChange={(event) => changeStatus(event.target.value as ReturnQuery["status"])}>
          <option value="ALL">{t("booksAllOptions")}</option>
          {tab === "OPEN" ? <><option value="NOT_STARTED">{t("submissionNotStarted")}</option><option value="IN_PROGRESS">{t("submissionInProgress")}</option><option value="CLOSED">{t("booksClosed")}</option><option value="REOPENED">{t("submissionStatusReopened")}</option><option value="OVERDUE">{t("assignOverdue")}</option></>
            : <><option value="IN_PROGRESS">{t("submissionInProgress")}</option><option value="RECONCILED">{t("returnsReconciled")}</option><option value="FLAGGED">{t("booksFlagged")}</option></>}
        </select></div>
      <BookExportButton source="SUBMISSIONS" filters={{ search: search.trim(), collectorId, bookType, editionId, tab }} initialStatus={overdue === "OVERDUE" ? "OVERDUE" : status} />
      {collectorId && <div className="col-span-full"><Button size="small" variant="outline" onClick={backToOverview}>{t("submissionAllFundraisers")}</Button></div>}
    </Card>
    {query.error != null && <p className="mb-4 text-sm text-[var(--danger)]" role="alert">{t(booksError(query.error))}</p>}
    {lossNotice && <p className="mb-4 rounded-xl bg-accent px-4 py-3 text-sm text-primary" role="status">{t("bookLostSuccess")}</p>}
    {(data || query.error == null) && <SubmissionSummary summary={data?.meta.summary} tab={tab} status={status} onStatusChange={changeStatus} />}
    <HistoricalCollections accountId={account.id} search={search} collectorId={collectorId} bookType={bookType} editionId={editionId} />
    {loading && data && <p className="mb-3 text-xs text-muted-foreground" role="status">{t("usersUpdating")}</p>}
    {!data && loading && <SubmissionListSkeleton />}
    {tab === "OPEN" && !collectorId && data && <p className="mb-3 text-xs text-muted-foreground">{t("submissionPreviewHelp")}</p>}
    <div className="space-y-4">{[...groups].map(([id, assigned]) => { const first = assigned[0]; if (!first) return null; const profile = first.assignment; const totals = fundraiserTotals.get(id);
      const totalBooks = totals?.assignedBookCount ?? assigned.length; const matchingBooks = totals?.matchingBookCount ?? assigned.length;
      return <Card key={id} className="overflow-hidden">
      <div className="flex w-full flex-wrap items-center gap-3 bg-accent/40 p-4 text-start">
        <span className="flex size-12 items-center justify-center overflow-hidden rounded-full bg-accent text-xl font-semibold text-primary">{first.hasPhoto ? <img alt="" className="size-full object-cover" src={`/api/v1/people/${id}/photo`} /> : profile.collectorName.slice(0, 1)}</span>
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{profile.collectorName}</strong>
          <Badge tone="success">{t("submissionTotalAssigned")}: {totalBooks}</Badge></span><span className="mt-1 block text-xs text-muted-foreground">{profile.collectorCode}{profile.phone && ` · ${profile.phone}`}</span></span>
        <span className="flex shrink-0 flex-wrap justify-end gap-x-5 gap-y-2 text-end" title={t("submissionAllBookTotals")}>
          <span><span className="block text-[10px] text-muted-foreground">{t("returnsTotal")}</span><strong className="mt-1 block text-sm tabular-nums text-primary">{displayMoney(totals?.collectedPaise ?? 0, language)}</strong></span>
          <span><span className="block text-[10px] text-muted-foreground">{t("returnsCommissionAmount")}</span><strong className="mt-1 block text-sm tabular-nums">{displayMoney(totals?.collectedCommissionPaise ?? 0, language)}</strong></span>
        </span>{!collectorId && <Button size="small" variant="outline" onClick={() => viewAllBooks(profile)}>
          {t("submissionViewAllBooks")}<ChevronRight size={16} className="shrink-0 [html[dir='rtl']_&]:rotate-180" aria-hidden="true" /></Button>}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <span>{t("submissionShowingBooks").replace("{shown}", String(assigned.length)).replace("{total}", String(matchingBooks))}
          {matchingBooks !== totalBooks && <span className="ms-2">{t("submissionTotalAssigned")}: {totalBooks}</span>}</span>
        {!collectorId && matchingBooks > assigned.length && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => viewAllBooks(profile)}>{t("submissionViewAllBooks")}</button>}
      </div>
      <FundraiserCertificateAction rows={assigned} onView={(assignmentId, fundraiserId) => setViewingCertificate({ assignmentId, fundraiserId, scope: "FUNDRAISER" })} />
      <div className="overflow-x-auto"><table className="w-full text-start text-xs [&_th]:bg-muted/50 [&_th]:p-3 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:p-3">
        <thead><tr><th>{t("booksNumber")}</th><th>{t("assignNumber")}</th><th className="whitespace-nowrap">{t("returnsTotal")}</th><th className="whitespace-nowrap">{t("returnsCommissionAmount")}</th><th>{t("status")}</th><th>{t("usersActions")}</th></tr></thead>
        <tbody>{assigned.map((row) => <tr key={row.id}><td><strong className="block whitespace-nowrap font-semibold" dir="ltr" title={row.sourceCode}>{submissionBookNumber(row)}</strong><span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">{t("booksReceiptRange")}: <bdi dir="ltr">{row.book.receiptFrom}–{row.book.receiptTo}</bdi></span></td>
          <td><span className="block whitespace-nowrap">{row.assignment.number}</span><span className="mt-1 block whitespace-nowrap text-[11px] text-muted-foreground">{t("assignReturnDate")}: {row.assignment.expectedReturnDate}</span></td>
          <td className="whitespace-nowrap font-semibold tabular-nums text-primary">{row.enteredReceiptCount > 0 ? displayMoney(row.collectedPaise, language) : "—"}</td>
          <td className="whitespace-nowrap font-semibold tabular-nums">{row.enteredReceiptCount > 0 ? displayMoney(row.collectedCommissionPaise, language) : "—"}</td>
          <td><div className="flex flex-wrap items-center gap-2"><Badge tone={row.submissionStatus === "CLOSED" ? "success" : row.submissionId ? "warning" : row.assignment.expectedReturnDate < indiaToday() ? "danger" : "neutral"}>
            {t(row.submissionStatus === "CLOSED" ? "booksClosed" : row.submissionStatus === "REOPENED" ? "submissionStatusReopened" : row.submissionId ? "submissionInProgress" : row.assignment.expectedReturnDate < indiaToday() ? "assignOverdue" : "booksAssigned")}</Badge>
            {row.submissionStatus === "CLOSED" && account.role === "SUPER_ADMIN" && <Button size="small" variant="outline" onClick={() => confirmReopen(row.submissionId, row.submissionVersion, submissionBookNumber(row))}>{t("submissionReopen")}</Button>}
          </div></td>
          <td><div className="flex flex-wrap items-center gap-2">{row.submissionId ? <Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.submissionId}`}>{t(row.submissionStatus === "CLOSED" ? "usersView" : "submissionResume")}</Link></Button>
            : <Button size="small" variant="outline" disabled={markingLost} onClick={() => setCurrent(row)}><ClipboardCheck size={15} />{t("submissionStart")}</Button>}
            {row.submissionStatus !== "CLOSED" && <Button size="small" variant="outline" className="text-[var(--danger)] hover:bg-[var(--danger-soft)]" disabled={Boolean(row.submissionId) || markingLost}
              title={row.submissionId ? t("bookLostStarted") : undefined} onClick={() => { setLostBook(row); setLossReason(""); setLossError(null); setLossNotice(false); }}>
              <BookX size={15} aria-hidden="true" />{t("bookMarkLost")}</Button>}
          </div></td></tr>)}</tbody></table></div></Card>; })}</div>
    {tab === "RETURNED" && <div className="grid gap-3">{(data?.data as ReturnRow[] | undefined)?.map((row) => <Card key={row.id} className="flex flex-wrap items-center gap-4 p-4"><div className="min-w-40 flex-1"><strong className="block text-sm">{row.collectorName}</strong><span className="mt-1 block text-xs text-muted-foreground">{row.sourceCode} · {row.number} · {row.returnDate}</span></div>
      <strong className="text-primary">{displayMoney(row.totalPaise, language)}</strong><Badge tone={row.unused ? "neutral" : row.receiptEntryStatus === "FLAGGED" ? "danger" : row.finalized ? "success" : "warning"}>{t(row.unused ? "booksNotUsed" : row.receiptEntryStatus === "FLAGGED" ? "booksFlagged" : row.finalized ? "booksClosed" : row.reopened ? "submissionStatusReopened" : "submissionInProgress")}</Badge>
      {row.finalized && account.role === "SUPER_ADMIN" && <Button size="small" variant="outline" onClick={() => confirmReopen(row.id, row.submissionVersion, row.sourceCode)}>{t("submissionReopen")}</Button>}
      <Button size="small" variant="outline" onClick={() => setViewingCertificate({ assignmentId: row.assignmentId, scope: "ASSIGNMENT" })}><Award size={15} aria-hidden="true" />{t("certificateView")}</Button>
      <Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.id}`}>{t(row.finalized ? "usersView" : "submissionResume")}</Link></Button></Card>)}</div>}
    {!loading && data?.data.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">{t(tab === "OPEN" ? "returnsEmptyOpen" : "submissionEmptyHistory")}</Card>}
    {data && <div className="flex items-center justify-between py-5 text-xs"><span>{t("usersPage")} {data.meta.page}/{Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize))} · {data.meta.total} {t(tab === "OPEN" ? collectorId ? "assignBookCount" : "peopleCollectors" : "submissionHistory")}</span><div className="flex gap-2">
      <Button size="small" variant="outline" disabled={loading || data.meta.page <= 1} onClick={() => setPage(data.meta.page - 1)}>{t("usersPrevious")}</Button><Button size="small" variant="outline" disabled={loading || data.meta.page * data.meta.pageSize >= data.meta.total} onClick={() => setPage(data.meta.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={current !== null} busy={busy} onOpenChange={(open) => { if (!open) setCurrent(null); }} title={t("submissionStart")} description={t("submissionDraftHelp")} className="w-[min(820px,calc(100vw-2rem))]">
      {current && <ReturnForm key={current.id} account={account} current={current} onBusyChange={setBusy} onSaved={saved} />}</Dialog>
    <Dialog open={viewingCertificate !== null} onOpenChange={(open) => { if (!open) setViewingCertificate(null); }} title={t("certificateTitle")} description={t(viewingCertificate?.scope === "FUNDRAISER" ? "certificateFundraiserHelp" : "certificateHelp")} className="w-[min(900px,calc(100vw-2rem))]">
      {viewingCertificate && <AuthorizationCertificateView key={`${viewingCertificate.scope}:${viewingCertificate.fundraiserId ?? viewingCertificate.assignmentId}`} accountId={account.id} {...viewingCertificate} />}
    </Dialog>
    <Dialog open={reopenTarget !== null} busy={reopening} onOpenChange={(open) => { if (!open) setReopenTarget(null); }} title={t("submissionReopen")} description={t("submissionReopenHelp")}>
      <p className="mt-3 text-sm font-semibold">{reopenTarget?.book}</p>
      <label htmlFor="return-reopen-reason" className="mb-2 mt-3 block text-xs">{t("submissionReason")}</label>
      <textarea id="return-reopen-reason" rows={3} maxLength={1000} disabled={reopening} value={reopenReason}
        onChange={(event) => setReopenReason(event.target.value)} className="w-full rounded-xl border border-border bg-card p-3 text-sm" />
      {reopenError && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{t(reopenError)}</p>}
      <div className="mt-4 flex justify-end"><Button loading={reopening} disabled={reopenReason.trim().length < 3} onClick={() => { void reopen(); }}>{t("submissionReopen")}</Button></div>
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
