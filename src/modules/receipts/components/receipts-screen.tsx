"use client";
import { receiptDonationOptionsSchema } from "@/modules/receipts/receipts.schema";
import { ReceiptOptionSelect } from "@/modules/receipts/components/receipt-option-select";
import { RECEIPT_FLAG_OPTIONS } from "@/modules/receipts/receipt-options";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReceiptRequestError, receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { receiptBookResponseSchema, receiptWorkflowSchema, receiptQueueSchema } from "@/modules/receipts/receipts.schema";
import { displayMoney } from "@/modules/books/returns.schema";
import { ReceiptForm } from "@/modules/receipts/components/receipt-form";
import type { Account } from "@/modules/auth/auth.types";
import type { ReceiptBook, ReceiptHeader, ReceiptQuery, ReceiptQueue } from "@/modules/receipts/receipts.schema";
import type { MessageKey } from "@/lib/i18n/messages";

function statusLabel(header: ReceiptHeader): MessageKey { return header.returned.receiptEntryStatus === "PENDING" ? "returnsPending" : header.returned.receiptEntryStatus === "DRAFT" ? "returnsDraft"
  : header.returned.receiptEntryStatus === "RECONCILED" ? "returnsReconciled" : "booksFlagged"; }
const tableClass = "w-full border-collapse text-start text-xs [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-start [&_th]:font-semibold [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-4 [&_td]:align-middle";
export function ReceiptQueueScreen({ account }: { account: Account }) {
  const { t } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:receipts:queue:`;
  const [search, setSearch] = usePageState(`${scope}search`, ""); const [status, setStatus] = usePageState<ReceiptQuery["status"]>(`${scope}status`, "PENDING");
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const params = new URLSearchParams({ search: search.trim(), status, page: String(page) }).toString();
  const load = useCallback(async (): Promise<ReceiptQueue> => { const result = receiptQueueSchema.parse(await receiptRequest(`/api/v1/receipt-entry?${params}`)); return { rows: result.data, ...result.meta }; }, [params]);
  const query = usePageQuery(`${scope}query:${params}`, load, { delay: search ? 300 : 0 }); const data = query.data; const loading = query.loading || query.stale;
  return <AppShell account={account} headerTitle="receiptEntry" sampleData={false} search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-[34px] font-bold tracking-tight">{t("receiptEntry")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("receiptQueueHelp")}</p></div>
      <Button asChild variant="outline"><Link href="/books/returns">{t("returnsScreen")}</Link></Button></div>
    <Card className="grid grid-cols-[minmax(0,1fr)_180px_42px] gap-3 p-4 max-[650px]:grid-cols-[minmax(0,1fr)_42px]">
      <Input type="search" maxLength={100} placeholder={t("receiptQueueSearch")} aria-label={t("search")} value={search} className="max-[650px]:col-span-2" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select className="rounded-[var(--radius-control)] border border-[var(--input)] bg-card px-3" aria-label={t("status")} value={status} onChange={(event) => { const value = event.target.value; if (value === "ALL" || value === "PENDING" || value === "FINALIZED") { setStatus(value); setPage(1); } }}>
        <option value="PENDING">{t("receiptPendingBooks")}</option><option value="FINALIZED">{t("receiptFinalized")}</option><option value="ALL">{t("booksAllOptions")}</option></select>
      <Button variant="outline" size="icon" aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(`${scope}query:`)}><RefreshCw size={17} /></Button></Card>
    <div className="my-5 flex justify-between text-xs"><span>{t("receiptQueueCount")}: {data?.total ?? 0}</span>{loading && <span role="status" className="text-muted-foreground">{t(data ? "usersUpdating" : "working")}</span>}</div>
    {query.error != null && <p className="my-4 text-sm text-[var(--danger)]" role="alert">{t(receiptError(query.error))}</p>}
    {data && data.rows.length > 0 && <Card className="overflow-hidden"><div className="overflow-x-auto [scrollbar-width:thin]"><table className={`${tableClass} min-w-[850px]`}><thead><tr>
      <th>{t("booksNumber")}</th><th>{t("peopleCollectors")}</th><th>{t("returnsDate")}</th><th>{t("booksReceiptRange")}</th><th>{t("status")}</th><th>{t("receiptOpenBook")}</th></tr></thead><tbody>
      {data.rows.map((row) => <tr key={row.returned.id}><td><strong>{row.returned.bookNumber}</strong><span className="mt-1 block text-muted-foreground">{row.returned.sourceCode} · {row.returned.number}</span></td>
        <td>{row.returned.collectorName}</td><td>{row.returned.returnDate}</td><td dir="ltr">{row.returned.lastUsed === null ? "—" : `${row.returned.receiptFrom}–${row.returned.lastUsed}`}</td>
        <td><Badge tone={row.returned.receiptEntryStatus === "FLAGGED" ? "danger" : row.finalized ? "success" : "warning"}>{t(statusLabel(row))}</Badge></td>
        <td><Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.returned.id}`}>{t(row.finalized ? "usersView" : "receiptOpenBook")}</Link></Button></td></tr>)}</tbody></table></div></Card>}
    {!loading && data?.rows.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground">{t("receiptQueueEmpty")}</Card>}
    {data && <Pagination page={data.page} total={data.total} size={data.pageSize} loading={loading} onPage={setPage} />}
  </AppShell>;
}
export function ReceiptBookScreen({ account, returnId }: { account: Account; returnId: string }) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:receipts:book:${returnId}:`;
  const loadDonations = useCallback(async () => receiptDonationOptionsSchema.parse(await receiptRequest("/api/v1/receipt-entry/options")).data, []);
  const donations = usePageQuery(`${account.id}:masters:receipt-donations`, loadDonations);
  const [flagReason, setFlagReason] = useState("");
  const [selected, setSelected] = useState(() => cache.read(`${scope}resume-number`, 0));
  const [jump, setJump] = useState("");
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null); const [confirm, setConfirm] = useState(false); const [finalizing, setFinalizing] = useState(false);
  const [mode, setMode] = useState<"RAISE_ISSUE" | "REQUEST_EDIT" | null>(null); const [reason, setReason] = useState(""); const [sending, setSending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null); const [notice, setNotice] = useState<MessageKey | null>(null);
  const key = `${scope}query:all`;
  const load = useCallback(async () => receiptBookResponseSchema.parse(await receiptRequest(`/api/v1/receipt-entry/${returnId}?resume=1`)).data, [returnId]);
  const query = usePageQuery(key, load, { enabled: !busy && !finalizing && !sending }); const data = query.data;
  const current = data?.rows.find((row) => row.number === (selected || data.lastCheckedNumber)) ?? data?.rows[0]; const record = current?.record;
  useEffect(() => {
    if (!data || selected !== 0) return;
    const number = data.lastCheckedNumber ?? data.header.returned.receiptFrom;
    cache.write(`${scope}resume-number`, number);
    setSelected(number);
  }, [cache, data, selected, scope]);
  const jumpNumber = /^\d+$/.test(jump) ? Number(jump) : 0;
  const canJump = Boolean(data && Number.isSafeInteger(jumpNumber) && jumpNumber >= data.header.returned.receiptFrom && jumpNumber <= (data.header.returned.lastUsed ?? 0));
  const approved = record && data?.requests.some((row) => row.receiptId === record.id && row.requestedBy === account.id && row.status === "APPROVED" && row.baseVersion === record.version);
  const activeRequest = record && data?.requests.find((row) => row.receiptId === record.id && row.requestedBy === account.id && row.baseVersion === record.version && (row.status === "PENDING" || row.status === "APPROVED"));
  function changed(book: ReceiptBook, finalized = false) {
    const savedRows = new Map(book.rows.map((row) => [row.number, row]));
    cache.updateQueries<ReceiptBook>(key, (previous) => ({ ...previous, header: book.header, totals: book.totals,
      checkedCount: book.checkedCount, lastCheckedNumber: book.lastCheckedNumber, requests: book.requests, issues: book.issues,
      rows: previous.rows.map((row) => savedRows.get(row.number) ?? row) }));
    const checkpoint = book.lastCheckedNumber ?? book.header.returned.receiptFrom;
    cache.write(`${scope}resume-number`, checkpoint);
    cache.invalidate(`${account.id}:receipts:queue:query:`); cache.invalidate(`${account.id}:returns:returned:`);
    if (finalized) {
      cache.invalidate(`${account.id}:returns:open:`); cache.invalidate(`${account.id}:assignments:query:`);
      cache.invalidate(`${account.id}:assignments:detail:${book.header.returned.assignmentId}`);
      cache.invalidate(`${account.id}:books:query:`); cache.invalidate(`${account.id}:leftovers:`);
      cache.invalidate(`${account.id}:flags:`); cache.invalidate(`${account.id}:receipts:donors:`);
    }
  }
  function navigate(number: number, discard = false) {
    if (!data || busy || finalizing || sending || !Number.isSafeInteger(number)
      || number < data.header.returned.receiptFrom || number > (data.header.returned.lastUsed ?? 0) || number === current?.number) return;
    if (dirty && !discard) { setLeaving(number); return; }
    setDirty(false); setSelected(number); setLeaving(null); setJump("");
  }
  async function finalize() {
    if (!data || finalizing || dirty) return; setFinalizing(true); setError(null);
    try {
      const result = receiptBookResponseSchema.parse(await receiptRequest(`/api/v1/receipt-entry/${returnId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "FINALIZE", version: data.header.version, page: data.page }) }));
      changed(result.data, true); setNotice(result.data.header.returned.receiptEntryStatus === "FLAGGED" ? "receiptFinalizedFlagged" : "receiptFinalizedMatched");
    } catch (failure) {
      setError(receiptError(failure));
      if (failure instanceof ReceiptRequestError && failure.number !== undefined) {
        setDirty(false); setSelected(failure.number);
      }
    } finally { setFinalizing(false); setConfirm(false); }
  }
  async function requestWorkflow() {
    if (!mode || !current || reason.trim().length < 3 || sending) return; setSending(true); setError(null);
    const flag = mode === "RAISE_ISSUE" ? RECEIPT_FLAG_OPTIONS.find((option) => option.code === flagReason) : undefined;
    const requestReason = flag ? `${flag.nameEn}: ${reason.trim()}` : reason;
    if ((mode === "RAISE_ISSUE" && !flag) || requestReason.length > 1000) { setSending(false); return; }
    try {
      const result = receiptWorkflowSchema.parse(await receiptRequest("/api/v1/receipt-workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, returnId, number: current.number, reason: requestReason }) }));
      cache.updateQueries<ReceiptBook>(`${scope}query:`, (previous) => ({ ...previous, requests: result.data.requests, issues: result.data.issues }));
      cache.invalidate(`${account.id}:receipt-review:`); cache.invalidate(`${account.id}:flags:`);
      if (mode === "RAISE_ISSUE" && data?.header.finalized) cache.invalidate(`${scope}query:`);
      setMode(null); setReason(""); setNotice("submissionRequestSent");
    } catch (failure) { setError(receiptError(failure)); } finally { setSending(false); }
  }
  const actions = data && <>
    {current && <>
      <Button variant="outline" size="small" disabled={busy || sending} onClick={() => { setMode("RAISE_ISSUE"); setFlagReason(""); setReason(""); }}><Flag size={14} />{t("returnsRaiseFlag")}</Button>
      {data.header.finalized && <Button variant="outline" size="small" disabled={busy || Boolean(activeRequest)} onClick={() => { setMode("REQUEST_EDIT"); setReason(""); }}>{t(approved ? "submissionEditApproved" : activeRequest ? "submissionEditPending" : "submissionRequestEdit")}</Button>}
      <Button variant="outline" size="small" disabled={busy || finalizing || sending || current.number <= data.header.returned.receiptFrom} onClick={() => navigate(current.number - 1)}><ChevronLeft size={14} />{t("submissionPreviousReceipt")}</Button>
      <Button size="small" disabled={busy || finalizing || sending || current.number >= (data.header.returned.lastUsed ?? 0)} onClick={() => navigate(current.number + 1)}>{t("submissionNextReceipt")}<ChevronRight size={14} /></Button>
      <div className="flex items-center gap-1.5"><Input inputMode="numeric" maxLength={10} value={jump} aria-label={t("receiptNumber")}
        placeholder={`${data.header.returned.receiptFrom}–${data.header.returned.lastUsed ?? data.header.returned.receiptFrom}`}
        className="min-h-8 w-24 px-2 py-1 text-xs" disabled={busy || finalizing || sending}
        onChange={(event) => setJump(event.target.value.replace(/\D/g, ""))}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (canJump) navigate(jumpNumber); } }} />
        <Button variant="outline" size="small" disabled={!canJump || busy || finalizing || sending} onClick={() => navigate(jumpNumber)}>{t("submissionGoReceipt")}</Button>
      </div>
    </>}
    {!data.header.finalized && <Button variant="outline" size="small" loading={finalizing} disabled={busy || dirty || data.checkedCount !== data.total} onClick={() => setConfirm(true)}>{t("submissionFinalize")}</Button>}
  </>;
  const messages = data && <>
    {data.header.finalized && <p className="px-2 text-xs text-muted-foreground">{t(approved ? "submissionEditApprovedHelp" : "receiptLocked")}</p>}
    {data.issues.filter((row) => row.receiptNumber === current?.number).map((row) => <div key={row.id} className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-3 text-xs"><strong>{t("flags")} · {row.status}</strong><p className="mt-1 whitespace-pre-wrap">{row.reason}</p>{row.resolution && <p className="mt-2">{row.resolution}</p>}</div>)}
    {record && data.requests.filter((row) => row.receiptId === record.id && row.requestedBy === account.id).map((row) => <div key={row.id} className="rounded-xl border border-border p-3 text-xs"><strong>{t("submissionRequestEdit")} · {row.status}</strong><p className="mt-1">{row.reason}</p>{row.reviewNote && <p className="mt-2 text-muted-foreground">{row.reviewNote}</p>}</div>)}
  </>;
  return <AppShell account={account} headerTitle="returnsScreen" sampleData={false} search="" onSearchChange={() => {}}>
    <div className="flex h-[calc(100dvh_-_var(--topbar-height)_-_52px)] min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3"><div><h1 className="text-xl font-bold">{t("returnsScreen")} {data?.header.returned.sourceCode ?? ""}</h1><p className="mt-1 text-[11px] text-muted-foreground">{t("submissionReceiptHelp")}</p></div>
        <div className="flex shrink-0 gap-2"><Button asChild variant="outline" size="small"><Link href="/books/returns">{t("submissionBack")}</Link></Button><Button variant="outline" size="icon" disabled={busy || dirty || finalizing} aria-label={t("usersRefresh")} loading={query.loading} onClick={() => cache.invalidate(`${scope}query:`)}><RefreshCw size={17} /></Button></div></div>
      {notice && <p className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs text-primary" role="status">{t(notice)}</p>}
      {(query.error != null || error) && <p className="shrink-0 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]" role="alert">{t(error ?? receiptError(query.error))}</p>}
      {!data && query.error == null && <Card className="p-8 text-sm text-muted-foreground" role="status">{t("working")}</Card>}
      {data && <>
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-stretch gap-3">
          <Card className="min-w-0 overflow-hidden p-3"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-lg font-bold text-primary">{data.header.hasPhoto ? <img alt="" className="size-full object-cover" src={`/api/v1/people/${data.header.collectorId}/photo`} /> : data.header.returned.collectorName.slice(0, 1)}</span>
            <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{data.header.returned.collectorName}</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">{data.header.collectorCode} · {data.header.phone}</span></div><Badge>{data.header.returned.bookNumber}</Badge></div>
            <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[11px]">{([["assignNumber", data.header.assignmentNumber], ["assignDate", data.header.assignmentDate], ["returnsDate", data.header.returned.returnDate], ["booksReceiptRange", `${data.header.returned.receiptFrom}–${data.header.returned.receiptTo}`], ["returnsUsed", data.header.returned.receiptsUsed], ["returnsRemaining", data.header.returned.remainingReceipts]] as [MessageKey, string | number][]).map(([label, value]) => <div key={label} className="min-w-0" title={label === "returnsRemaining" ? t("submissionUnusedHelp") : undefined}><dt className="truncate text-[10px] text-muted-foreground">{t(label)}</dt><dd className="mt-0.5 truncate font-medium">{value}</dd></div>)}</dl>
            <p className="mt-2 truncate border-t border-border pt-2 text-[10px] text-muted-foreground" title={data.header.address}>{data.header.address || "—"}</p>
          </Card>
          <Card className="min-w-0 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">{t("submissionSummary")}</h3><span className="text-[10px] text-muted-foreground">{t("returnsCommission")}: {data.header.returned.commissionBasisPoints / 100}% · {t("returnsCommissionGiven")}: {t(data.header.returned.commissionGiven ? "returnsYes" : "returnsNo")}</span></div>
            <div className="grid grid-cols-3 gap-2">{([["returnsTotal", data.header.returned.totalPaise, data.totals.total], ["returnsCash", data.header.returned.cashPaise, data.totals.cash], ["returnsDigital", data.header.returned.digitalPaise, data.totals.digital]] as [MessageKey, number, number][]).map(([label, expected, entered]) => <div key={label} className="min-w-0 rounded-lg bg-muted/50 px-2.5 py-2"><span className="block truncate text-[10px] text-muted-foreground">{t(label)}</span><strong className="mt-0.5 block text-base">{displayMoney(expected, language)}</strong><span className={`mt-0.5 block truncate text-[10px] ${expected === entered ? "text-primary" : "text-[var(--warning)]"}`}>{t("submissionEntered")}: {displayMoney(entered, language)}</span></div>)}</div>
            <div className="mt-2 grid grid-cols-4 gap-2 border-t border-border pt-2">{([["returnsCommissionAmount", data.header.returned.commissionPaise], ["returnsNet", data.header.returned.netPaise], [data.header.returned.cashHandoverPaise < 0 ? "returnsPayable" : "returnsHandover", Math.abs(data.header.returned.cashHandoverPaise)], ["returnsDifference", data.header.returned.totalPaise - data.totals.total]] as [MessageKey, number][]).map(([label, value]) => <div key={label} className="min-w-0"><span className="block truncate text-[10px] text-muted-foreground" title={t(label)}>{t(label)}</span><strong className={`mt-0.5 block text-sm ${label === "returnsNet" ? "text-primary" : ""}`}>{displayMoney(value, language)}</strong></div>)}</div>
            {data.totals.cheque > 0 && <p className="mt-1 text-[10px] text-[var(--warning)]">{t("receiptChequeWarning")} {displayMoney(data.totals.cheque, language)}</p>}
          </Card>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="shrink-0 space-y-2 border-b border-border px-3 py-2"><div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold">{t("receiptEntry")}{current && ` · ${current.number}`}</span><div className="flex items-center gap-3"><span>{t("receiptEntered")}: <b>{data.totals.saved}/{data.total}</b> · {t("submissionChecked")}: <b>{data.checkedCount}/{data.total}</b></span><Badge tone={data.header.returned.receiptEntryStatus === "FLAGGED" ? "danger" : data.header.finalized ? "success" : "warning"}>{t(statusLabel(data.header))}</Badge></div></div>
            <div className="h-1 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${data.total === 0 ? 100 : data.checkedCount / data.total * 100}%` }} /></div></div>
          <div className="min-h-0 flex-1">{current ? <ReceiptForm key={current.number} accountId={account.id} number={current.number} record={current.record} header={data.header} totals={data.totals} donationCategories={donations.data?.categories ?? []} donationsLoading={!donations.data && (donations.loading || donations.stale)} donationError={donations.error} onRetryDonations={() => cache.invalidate(`${account.id}:masters:receipt-donations`)} page={Math.floor((current.number - data.header.returned.receiptFrom) / 20) + 1} allowEdit={Boolean(approved)} onBusyChange={setBusy} onDirtyChange={setDirty} actions={actions} messages={messages}
            onSaved={(book) => { changed(book, data.header.finalized); setDirty(false);
              const saved = book.rows.find((row) => row.number === current.number)?.record;
              setNotice(saved?.checked && saved.values.status === "CANCELLED" ? "receiptCancelledSaved" : data.header.finalized ? "submissionCorrectionSaved" : "receiptDraftSaved"); }} />
            : <div className="flex h-full min-h-0 flex-col"><p className="min-h-0 flex-1 overflow-y-auto p-8 text-center text-sm text-muted-foreground">{t("receiptNoUsed")}</p><div className="flex shrink-0 justify-end border-t border-border bg-card p-3">{actions}</div></div>}</div>
        </div>
      </>}
    </div>
    <Dialog open={confirm} busy={finalizing} onOpenChange={setConfirm} title={t("submissionFinalize")} description={t("receiptFinalizeHelp")}><div className="flex justify-end pt-5"><Button loading={finalizing} onClick={() => { void finalize(); }}>{t("submissionFinalize")}</Button></div></Dialog>
    <Dialog open={mode !== null} busy={sending} onOpenChange={(open) => { if (!open) setMode(null); }} title={t(mode === "REQUEST_EDIT" ? "submissionRequestEdit" : "returnsRaiseFlag")} description={t("submissionReasonHelp")}>
      {mode === "RAISE_ISSUE" && <div className="mt-4"><ReceiptOptionSelect label="flags" value={flagReason} onChange={setFlagReason} options={RECEIPT_FLAG_OPTIONS.map(({ code, ...labels }) => ({ id: code, ...labels }))} /></div>}
      <label className="mb-2 mt-4 block text-xs" htmlFor="workflow-reason">{t("submissionReason")}</label><textarea id="workflow-reason" rows={4} minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-border bg-card p-3 text-sm" />
      <div className="mt-4 flex justify-end"><Button loading={sending} disabled={reason.trim().length < 3 || (mode === "RAISE_ISSUE" && (!flagReason || reason.trim().length + (RECEIPT_FLAG_OPTIONS.find((option) => option.code === flagReason)?.nameEn.length ?? 0) + 2 > 1000))} onClick={() => { void requestWorkflow(); }}>{t("submissionSend")}</Button></div></Dialog>
    <Dialog open={leaving !== null} onOpenChange={(open) => { if (!open) setLeaving(null); }} title={t("submissionUnsaved")} description={t("submissionUnsavedHelp")}><div className="flex justify-end gap-2 pt-5"><Button variant="outline" onClick={() => setLeaving(null)}>{t("submissionStay")}</Button><Button onClick={() => { if (leaving !== null) navigate(leaving, true); }}>{t("submissionDiscard")}</Button></div></Dialog>
  </AppShell>;
}
function Pagination({ page, total, size, loading, onPage }: { page: number; total: number; size: number; loading: boolean; onPage: (value: number) => void }) {
  const { t } = useLanguage(); return <div className="flex items-center justify-between gap-3 py-5 text-xs"><span className="text-muted-foreground">{t("usersPage")} {page}/{Math.max(1, Math.ceil(total / size))}</span>
    <div className="flex gap-2"><Button size="small" variant="outline" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>{t("usersPrevious")}</Button><Button size="small" variant="outline" disabled={loading || page * size >= total} onClick={() => onPage(page + 1)}>{t("usersNext")}</Button></div></div>;
}
