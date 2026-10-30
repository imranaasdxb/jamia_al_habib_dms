"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronRight, Eye, MapPin, Phone, ReceiptText, RefreshCw, Search, Trophy, UserRound, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { displayMoney } from "@/modules/books/returns.schema";
import { donorError, donorRequest } from "@/modules/donors/donors.client";
import { defaultDonorFilters, donorDirectorySchema, donorHistorySchema, donorQuerySchema } from "@/modules/donors/donors.schema";
import type { DonorQuery, DonorRow, DonorSummary } from "@/modules/donors/donors.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ReactNode } from "react";

type Filters = Omit<DonorQuery, "page">;
const selectClass = "min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-xs outline-none transition-colors hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/15";
const tableClass = "w-full border-collapse text-start text-xs [&_th]:bg-muted/60 [&_th]:px-4 [&_th]:py-3 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-4 [&_td]:align-middle";
const kindLabels = { NAMED: "donorsNamed", ANONYMOUS: "receiptAnonymous", UNRECORDED: "donorsUnrecorded" } as const;
const paymentLabels = { CASH: "receiptCash", DIGITAL: "receiptDigital", CHEQUE: "receiptCheque" } as const;
const location = (area: string, state: string) => [...new Set([area, state].filter(Boolean))].join(", ");
function parameters(filters: Filters, page: number) {
  const result = new URLSearchParams();
  Object.entries({ ...filters, page }).forEach(([key, value]) => result.set(key, String(value)));
  return result.toString();
}
function Select<T extends string>({ label, value, options, onChange }: {
  label: MessageKey; value: T; options: readonly (readonly [T, MessageKey])[]; onChange: (value: T) => void;
}) {
  const { t } = useLanguage();
  return <label className="min-w-0"><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{t(label)}</span>
    <select className={selectClass} value={value} onChange={(event) => { const option = options.find(([key]) => key === event.target.value); if (option) onChange(option[0]); }}>
      {options.map(([key, text]) => <option key={key} value={key}>{t(text)}</option>)}
    </select></label>;
}
function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-current/10 ${className}`} />;
}
function Metric({ title, icon, children, className = "" }: { title: MessageKey; icon: ReactNode; children: ReactNode; className?: string }) {
  const { t } = useLanguage();
  return <Card className={`min-w-0 rounded-2xl p-4 ${className}`}><div className="flex items-center justify-between gap-2 text-[11px] font-medium"><span>{t(title)}</span><span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-current/5">{icon}</span></div>{children}</Card>;
}
function SummaryCards({ summary, loading }: { summary?: DonorSummary; loading: boolean }) {
  const { t, language } = useLanguage(); const money = (value: number) => displayMoney(value, language);
  return <div className="mb-5" aria-busy={loading}>
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Metric title="donorsCollected" icon={<Wallet size={17} />} className="border-emerald-700 bg-gradient-to-br from-emerald-800 to-emerald-600 text-white shadow-sm">
        {loading ? <Skeleton className="mt-3 h-8 w-4/5" /> : <strong className="mt-3 block break-words text-2xl font-bold tracking-tight tabular-nums">{summary ? money(summary.collectedPaise) : "—"}</strong>}
        <p className="mt-2 text-[11px] text-emerald-100">{summary?.receipts ?? "—"} {t("donorsReceipts")}</p>
      </Metric>
      <Metric title="donorsNamed" icon={<Users size={17} />} className="border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/70 text-sky-950">
        {loading ? <Skeleton className="mt-3 h-8 w-1/2" /> : <strong className="mt-3 block text-2xl font-bold tabular-nums">{summary?.namedDonors ?? "—"}</strong>}
        <p className="mt-2 text-[11px] text-sky-700">{summary?.repeatDonors ?? "—"} {t("donorsReturning")}</p>
      </Metric>
      <Metric title="donorsHighest" icon={<Trophy size={17} />} className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100/70 text-amber-950">
        {loading ? <Skeleton className="mt-3 h-6 w-4/5" /> : <strong className="mt-3 block truncate text-base" title={summary?.topDonor?.name}>{summary?.topDonor?.name || "—"}</strong>}
        <p className="mt-2 text-lg font-bold tabular-nums">{summary?.topDonor ? money(summary.topDonor.collectedPaise) : "—"}</p>
        {summary?.topDonor && <p className="mt-1 text-[10px] text-amber-800">{summary.topDonor.receipts} {t("donorsReceipts")}</p>}
      </Metric>
      <Metric title="donorsTopArea" icon={<MapPin size={17} />} className="border-violet-200 bg-gradient-to-br from-violet-50 to-purple-100/70 text-violet-950">
        {loading ? <Skeleton className="mt-3 h-6 w-4/5" /> : <strong className="mt-3 block truncate text-base" title={summary?.topArea ? location(summary.topArea.name, summary.topArea.state) : undefined}>{summary?.topArea?.name || "—"}</strong>}
        <p className="mt-2 text-lg font-bold tabular-nums">{summary?.topArea ? money(summary.topArea.collectedPaise) : "—"}</p>
        {summary?.topArea && <p className="mt-1 text-[10px] text-violet-800">{summary.topArea.receipts} {t("donorsReceipts")}</p>}
      </Metric>
      <Metric title="donorsOtherAmounts" icon={<UserRound size={17} />} className="border-border bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
        {loading ? <Skeleton className="mt-3 h-12 w-full" /> : <dl className="mt-3 space-y-2 text-[10px]">
          <div className="flex flex-wrap justify-between gap-1"><dt>{t("receiptAnonymous")}</dt><dd className="font-semibold tabular-nums">{summary ? money(summary.anonymousPaise) : "—"}</dd></div>
          <div className="flex flex-wrap justify-between gap-1"><dt>{t("donorsUnrecorded")}</dt><dd className="font-semibold tabular-nums">{summary ? money(summary.unrecordedPaise) : "—"}</dd></div>
        </dl>}
      </Metric>
    </div>
    {summary && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
      <span>{t("donorsSummaryScope")}</span><div className="flex flex-wrap gap-x-5 gap-y-2">
        {([ ["receiptCash", summary.cashPaise], ["receiptDigital", summary.digitalPaise], ["receiptCheque", summary.chequePaise] ] as const).map(([label, value]) => <span key={label}>{t(label)} <b className="ms-1 font-medium tabular-nums text-foreground">{money(value)}</b></span>)}
      </div>
    </div>}
  </div>;
}

export function DonorsScreen({ account }: { account: Account }) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:receipts:donors:directory:`;
  const [filters, setFilters] = usePageState<Filters>(`${scope}filters`, defaultDonorFilters());
  const [draft, setDraft] = usePageState<Filters>(`${scope}draft`, filters);
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const [viewing, setViewing] = useState<DonorRow | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const params = parameters(filters, page);
  const load = useCallback(async () => donorDirectorySchema.parse(await donorRequest(`/api/v1/donors?${params}`)), [params]);
  const query = usePageQuery(`${scope}query:${params}`, load, { enabled: !viewing });
  const result = query.data; const loading = !result && (query.loading || query.stale);
  function apply() {
    const next = { ...draft, search: draft.search.trim(), area: draft.area.trim() };
    if (!donorQuerySchema.safeParse({ ...next, page: 1 }).success) { setFormError(next.from && next.to && next.from > next.to ? "donorsDateInvalid" : "donorsInvalid"); return; }
    setFormError(null); setFilters(next); setDraft(next); setPage(1);
  }
  function reset() { const empty = defaultDonorFilters(); setDraft(empty); setFilters(empty); setPage(1); setFormError(null); }
  return <AppShell account={account} headerTitle="donors" sampleData={false} search={draft.search} onSearchChange={(search) => setDraft((previous) => ({ ...previous, search }))}>
    <div className="mb-5"><h1 className="text-3xl font-bold tracking-tight">{t("donors")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("donorsDescription")}</p></div>
    <SummaryCards summary={result?.data.summary} loading={loading} />
    <Card className="mb-4 rounded-2xl p-4"><form onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-3 xl:grid-cols-[minmax(220px,1fr)_155px_140px_155px_42px]">
        <label className="min-w-0"><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{t("donorsSearchLabel")}</span><span className="relative block">
          <Input type="search" maxLength={100} className="min-h-11 rounded-xl pe-11 text-xs" placeholder={t("donorsSearch")} value={draft.search} onChange={(event) => setDraft((previous) => ({ ...previous, search: event.target.value }))} />
          <button type="submit" aria-label={t("donorsApply")} className="absolute inset-y-1 end-1 flex w-9 items-center justify-center rounded-lg text-primary transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary"><Search size={17} /></button>
        </span></label>
        <Select<Filters["kind"]> label="donorsIdentity" value={draft.kind} options={[["ALL", "booksAllOptions"], ["NAMED", "donorsNamed"], ["ANONYMOUS", "receiptAnonymous"], ["UNRECORDED", "donorsUnrecorded"]]} onChange={(kind) => setDraft((previous) => ({ ...previous, kind }))} />
        <Select<Filters["bookType"]> label="donorsBookType" value={draft.bookType} options={[["ALL", "booksAllOptions"], ["REGULAR", "booksRegular"], ["TOKEN", "booksToken"]]} onChange={(bookType) => setDraft((previous) => ({ ...previous, bookType }))} />
        <Select<Filters["sort"]> label="donorsSort" value={draft.sort} options={[["HIGHEST", "donorsHighestFirst"], ["RECENT", "donorsRecent"], ["NAME", "donorsAZ"], ["REPEAT", "donorsMostReceipts"]]} onChange={(sort) => setDraft((previous) => ({ ...previous, sort }))} />
        <Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(`${account.id}:receipts:donors:`)}><RefreshCw size={17} /></Button>
      </div>
      <div className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-border/70 pt-3 md:grid-cols-3 xl:grid-cols-[minmax(110px,1fr)_145px_145px_130px_135px_auto]">
        <label><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{t("donorsArea")}</span><Input maxLength={120} placeholder={t("donorsAreaPlaceholder")} className="min-h-11 rounded-xl text-xs" value={draft.area} onChange={(event) => setDraft((previous) => ({ ...previous, area: event.target.value }))} /></label>
        <label><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{t("donorsFrom")}</span><Input type="date" className="min-h-11 rounded-xl px-2 text-xs" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft((previous) => ({ ...previous, from: event.target.value }))} /></label>
        <label><span className="mb-1.5 block text-[10px] font-medium text-muted-foreground">{t("donorsTo")}</span><Input type="date" className="min-h-11 rounded-xl px-2 text-xs" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft((previous) => ({ ...previous, to: event.target.value }))} /></label>
        <Select<Filters["payment"]> label="receiptPayment" value={draft.payment} options={[["ALL", "booksAllOptions"], ["CASH", "receiptCash"], ["DIGITAL", "receiptDigital"], ["CHEQUE", "receiptCheque"]]} onChange={(payment) => setDraft((previous) => ({ ...previous, payment }))} />
        <Select<Filters["checked"]> label="donorsVerification" value={draft.checked} options={[["ALL", "booksAllOptions"], ["CHECKED", "donorsChecked"], ["UNCHECKED", "donorsUnchecked"]]} onChange={(checked) => setDraft((previous) => ({ ...previous, checked }))} />
        <div className="flex gap-2"><Button variant="ghost" size="small" className="min-h-11" onClick={reset}>{t("donorsReset")}</Button><Button type="submit" size="small" className="min-h-11" loading={query.loading}>{t("donorsApply")}</Button></div>
      </div>
      {formError && <p className="mt-3 text-xs text-[var(--danger)]" role="alert">{t(formError)}</p>}
    </form></Card>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{t("donorsRecords")}: <b className="text-foreground">{result?.meta.total ?? "—"}</b></span><span>{t("donorsIdentityHelp")}</span></div>
    {query.error != null && <p role="alert" className="mb-3 rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{t(donorError(query.error))}</p>}
    <Card className="overflow-hidden rounded-2xl" aria-busy={query.loading || undefined}><div className="overflow-x-auto [scrollbar-width:thin]">
      <table className={`${tableClass} min-w-[850px] table-fixed`}><colgroup><col className="w-[25%]" /><col className="w-[23%]" /><col className="w-[10%]" /><col className="w-[17%]" /><col className="w-[14%]" /><col className="w-[11%]" /></colgroup>
        <thead><tr><th>{t("receiptDonorName")}</th><th>{t("donorsArea")}</th><th className="text-center!">{t("donorsReceipts")}</th><th className="text-end!">{t("donorsCollected")}</th><th>{t("donorsLastDate")}</th><th className="text-end!">{t("usersActions")}</th></tr></thead>
        <tbody>{loading ? Array.from({ length: 6 }, (_, i) => <tr key={i}>{Array.from({ length: 6 }, (_, j) => <td key={j}><Skeleton className="h-5 w-full text-slate-400" /></td>)}</tr>) : result?.data.rows.map((row) => <tr key={row.key} className="transition-colors hover:bg-muted/30">
          <td><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-primary">{row.kind === "NAMED" ? row.name.slice(0, 1).toUpperCase() : <UserRound size={17} />}</span>
            <div className="min-w-0"><strong className="block truncate text-sm" title={row.name}>{row.kind === "NAMED" ? row.name : t(kindLabels[row.kind])}</strong>
              {row.phone ? <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone size={11} /><bdi dir="ltr">{row.phone}</bdi></span> : <span className="mt-1 block text-[10px] text-muted-foreground">{t(row.kind === "NAMED" ? "donorsNoPhone" : kindLabels[row.kind])}</span>}
            </div></div></td>
          <td><span className="block truncate" title={location(row.area, row.state)}>{row.area || t("donorsNotRecorded")}</span>{row.state && row.state !== row.area && <span className="mt-1 block text-[11px] text-muted-foreground">{row.state}</span>}</td>
          <td className="text-center! tabular-nums">{row.receipts}</td><td className="text-end! font-semibold tabular-nums text-primary">{displayMoney(row.collectedPaise, language)}</td>
          <td className="whitespace-nowrap tabular-nums">{row.lastDate}</td><td className="text-end!"><Button size="small" variant="outline" onClick={() => setViewing(row)}><Eye size={14} />{t("donorsHistory")}</Button></td>
        </tr>)}
        {!loading && result?.data.rows.length === 0 && <tr><td colSpan={6} className="py-12! text-center! text-muted-foreground"><Users className="mx-auto mb-3" size={25} /><p>{t("donorsEmpty")}</p></td></tr>}
        </tbody>
      </table>
    </div></Card>
    {result && <Pagination page={result.meta.page} total={result.meta.total} pageSize={result.meta.pageSize} busy={query.loading} onPage={setPage} />}
    <Dialog open={viewing !== null} onOpenChange={(open) => { if (!open) setViewing(null); }} title={t("donorsHistoryTitle")} description={t("donorsHistoryHelp")} className="w-[min(1100px,calc(100vw-2rem))]">
      {viewing && <DonorHistory key={viewing.key} accountId={account.id} row={viewing} filters={filters} />}
    </Dialog>
  </AppShell>;
}

function Pagination({ page, pageSize, total, busy, onPage }: { page: number; pageSize: number; total: number; busy: boolean; onPage: (page: number) => void }) {
  const { t } = useLanguage();
  return <div className="flex items-center justify-between gap-3 py-4 text-xs text-muted-foreground"><span>{t("usersPage")} {page} / {Math.max(1, Math.ceil(total / pageSize))}</span><div className="flex gap-2">
    <Button variant="outline" size="small" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{t("usersPrevious")}</Button>
    <Button variant="outline" size="small" disabled={busy || page * pageSize >= total} onClick={() => onPage(page + 1)}>{t("usersNext")}<ChevronRight size={14} /></Button>
  </div></div>;
}

function DonorHistory({ accountId, row, filters }: { accountId: string; row: DonorRow; filters: Filters }) {
  const { t, language } = useLanguage(); const [page, setPage] = useState(1); const cache = usePageDataCache();
  const params = parameters({ ...filters, sort: "RECENT" }, page); const key = `${accountId}:receipts:donors:history:${row.key}:${params}`;
  const load = useCallback(async () => donorHistorySchema.parse(await donorRequest(`/api/v1/donors/${row.key}?${params}`)), [row.key, params]);
  const query = usePageQuery(key, load); const result = query.data; const loading = !result && (query.loading || query.stale);
  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-accent/50 p-4"><div className="min-w-0 flex-1"><strong className="block text-base">{row.kind === "NAMED" ? row.name : t(kindLabels[row.kind])}</strong><p className="mt-1 text-xs text-muted-foreground">{[row.phone, location(row.area, row.state)].filter(Boolean).join(" · ") || t("donorsNotRecorded")}</p></div><div className="text-end"><span className="block text-[10px] text-muted-foreground">{t("donorsCollected")}</span><strong className="text-xl tabular-nums text-primary">{displayMoney(row.collectedPaise, language)}</strong></div><Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(key)}><RefreshCw size={16} /></Button></div>
    {query.error != null && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{t(donorError(query.error))}</p>}
    <div className="overflow-x-auto rounded-xl border border-border [scrollbar-width:thin]" aria-busy={query.loading || undefined}><table className={`${tableClass} min-w-[900px]`}>
      <thead><tr><th>{t("donorsDate")}</th><th>{t("booksNumber")}</th><th>{t("donorsReceiptNo")}</th><th>{t("peopleCollectors")}</th><th>{t("donorsArea")}</th><th>{t("receiptPayment")}</th><th className="text-end!">{t("donorsAmount")}</th><th>{t("status")}</th><th>{t("usersActions")}</th></tr></thead>
      <tbody>{loading ? Array.from({ length: 4 }, (_, i) => <tr key={i}>{Array.from({ length: 9 }, (_, j) => <td key={j}><Skeleton className="h-4 w-14 text-slate-400" /></td>)}</tr>) : result?.data.map((receipt) => <tr key={receipt.id}>
        <td className="whitespace-nowrap">{receipt.date}</td><td><strong className="block whitespace-nowrap text-[11px]">{receipt.bookNumber}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{receipt.editionName}</span></td>
        <td className="tabular-nums">{receipt.number}</td><td>{receipt.fundraiser}</td><td>{location(receipt.area, receipt.state) || t("donorsNotRecorded")}</td><td>{t(paymentLabels[receipt.payment])}</td>
        <td className="whitespace-nowrap text-end! font-semibold tabular-nums text-primary">{displayMoney(receipt.amountPaise, language)}</td><td><Badge tone={receipt.checked ? "success" : "warning"}>{t(receipt.checked ? "donorsChecked" : "donorsUnchecked")}</Badge></td>
        <td><Button asChild variant="ghost" size="small"><Link href={`/receipt-entry/${receipt.returnId}`}><ReceiptText size={14} />{t("submissionResume")}</Link></Button></td>
      </tr>)}{!loading && result?.data.length === 0 && <tr><td colSpan={9} className="py-10! text-center! text-muted-foreground">{t("donorsEmpty")}</td></tr>}</tbody>
    </table></div>
    {result && <Pagination page={result.meta.page} pageSize={result.meta.pageSize} total={result.meta.total} busy={query.loading} onPage={setPage} />}
  </div>;
}
