"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { receiptWorkflowSchema } from "@/modules/receipts/receipts.schema";
import { displayMoney } from "@/modules/books/returns.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { MessageKey } from "@/lib/i18n/messages";

type Review = { action: "REVIEW_EDIT" | "RESOLVE_ISSUE" | "RESOLVE_BOOK_FLAG"; id: string; decision?: "APPROVED" | "REJECTED" };
export function ReceiptReviewScreen({ account, mode }: { account: Account; mode: "EDITS" | "ISSUES" }) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const key = `${account.id}:receipt-review:all`;
  const [search, setSearch] = usePageState(`${key}:${mode}:search`, ""); const [status, setStatus] = usePageState(`${key}:${mode}:status`, "ACTIVE");
  const [review, setReview] = useState<Review | null>(null); const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  const load = useCallback(async () => receiptWorkflowSchema.parse(await receiptRequest("/api/v1/receipt-workflow")).data, []);
  const query = usePageQuery(key, load); const term = search.trim().toLowerCase();
  const requests = query.data?.requests.filter((row) => (status === "ALL" || row.status === "PENDING" || row.status === "APPROVED") && `${row.receiptNumber} ${row.requestedByName} ${row.reason}`.toLowerCase().includes(term));
  const issues = query.data?.issues.filter((row) => (status === "ALL" || row.status === "OPEN") && `${row.receiptNumber} ${row.raisedByName} ${row.reason}`.toLowerCase().includes(term));
  const flags = query.data?.flags.filter((row) => (status === "ALL" || row.status !== "RESOLVED") && `${row.bookNumber} ${row.collectorName} ${row.reason}`.toLowerCase().includes(term));
  function open(value: Review) { setReview(value); setReason(""); setError(null); }
  async function save() {
    if (!review || busy || reason.trim().length < 3) return; setBusy(true); setError(null);
    try {
      const next = receiptWorkflowSchema.parse(await receiptRequest("/api/v1/receipt-workflow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...review, reason }) }));
      cache.setQueryData(key, next.data); cache.invalidate(`${account.id}:receipts:book:`);
      cache.invalidate(`${account.id}:receipts:queue:`); cache.invalidate(`${account.id}:returns:returned:`);
      if (review.action === "RESOLVE_BOOK_FLAG") { cache.invalidate(`${account.id}:leftovers:`); cache.invalidate(`${account.id}:books:query:`); }
      setReview(null);
    } catch (failure) { setError(receiptError(failure)); } finally { setBusy(false); }
  }
  return <AppShell account={account} headerTitle={mode === "EDITS" ? "approvals" : "flags"} sampleData={false} search={search} onSearchChange={setSearch}>
    <div className="mb-6"><h1 className="text-3xl font-bold">{t(mode === "EDITS" ? "submissionEditReviews" : "submissionIssueReviews")}</h1><p className="mt-2 text-sm text-muted-foreground">{t(mode === "EDITS" ? "submissionReviewHelp" : "submissionIssueHelp")}</p></div>
    <Card className="mb-5 flex items-center gap-3 p-4"><Input type="search" maxLength={100} aria-label={t("search")} placeholder={t("search")} value={search} onChange={(event) => setSearch(event.target.value)} />
      <select className="min-h-11 rounded-xl border border-border bg-card px-3 text-xs" aria-label={t("status")} value={status} onChange={(event) => setStatus(event.target.value)}><option value="ACTIVE">{t("submissionPendingReview")}</option><option value="ALL">{t("booksAllOptions")}</option></select>
      <Button variant="outline" size="icon" loading={query.loading} aria-label={t("usersRefresh")} onClick={() => cache.invalidate(key)}><RefreshCw size={16} /></Button></Card>
    {(query.error != null || error) && <p role="alert" className="mb-4 text-sm text-[var(--danger)]">{t(error ?? receiptError(query.error))}</p>}
    {!query.data && query.loading && <p role="status">{t("working")}</p>}
    <div className="space-y-3">{mode === "EDITS" ? requests?.map((row) => <Card key={row.id} className="space-y-3 p-5"><div className="flex items-center justify-between gap-3"><strong className="text-sm">{t("receiptNumber")} {row.receiptNumber} · {row.requestedByName}</strong><Badge tone={row.status === "APPROVED" ? "success" : "neutral"}>{row.status}</Badge></div>
      <p className="whitespace-pre-wrap text-sm">{row.reason}</p>{row.reviewNote && <p className="text-xs text-muted-foreground">{row.reviewNote}</p>}<div className="flex justify-between gap-3"><Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.returnId}`}>{t("submissionOpenReceipt")}</Link></Button>
        {account.role === "ADMIN" && row.status === "PENDING" && <div className="flex gap-2"><Button size="small" variant="outline" onClick={() => open({ action: "REVIEW_EDIT", id: row.id, decision: "REJECTED" })}>{t("submissionReject")}</Button><Button size="small" onClick={() => open({ action: "REVIEW_EDIT", id: row.id, decision: "APPROVED" })}>{t("submissionApprove")}</Button></div>}</div></Card>)
      : <>{issues?.map((row) => <Card key={row.id} className="space-y-3 p-5"><div className="flex justify-between gap-3"><strong className="text-sm">{t("receiptNumber")} {row.receiptNumber} · {row.raisedByName}</strong><Badge tone={row.status === "OPEN" ? "danger" : "success"}>{row.status}</Badge></div><p className="whitespace-pre-wrap text-sm">{row.reason}</p>{row.resolution && <p className="text-xs text-muted-foreground">{row.resolution}</p>}<div className="flex justify-between"><Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.returnId}`}>{t("submissionOpenReceipt")}</Link></Button>{account.role === "ADMIN" && row.status === "OPEN" && <Button size="small" onClick={() => open({ action: "RESOLVE_ISSUE", id: row.id })}>{t("submissionResolve")}</Button>}</div></Card>)}
        {flags?.map((row) => <Card key={row.id} className="space-y-3 border-[var(--warning)]/30 p-5"><div className="flex justify-between gap-3"><strong className="text-sm">{row.bookNumber} · {row.collectorName}</strong><Badge tone={row.status === "RESOLVED" ? "success" : "warning"}>{row.status}</Badge></div><p className="text-sm">{row.reason}</p><p className="text-xs text-muted-foreground">{t("returnsExpected")}: {displayMoney(row.expectedPaise, language)} · {t("returnsFound")}: {displayMoney(row.foundPaise, language)}</p>
          <div className="flex justify-between"><Button asChild size="small" variant="outline"><Link href={`/receipt-entry/${row.returnId}`}>{t("submissionOpenReceipt")}</Link></Button>{account.role === "ADMIN" && row.status !== "RESOLVED" && <Button size="small" onClick={() => open({ action: "RESOLVE_BOOK_FLAG", id: row.id })}>{t("submissionResolve")}</Button>}</div></Card>)}</>}
      {query.data && (mode === "EDITS" ? !requests?.length : !issues?.length && !flags?.length) && <Card className="p-10 text-center text-sm text-muted-foreground">{t("submissionNoReviews")}</Card>}
    </div><p className="mt-5 text-xs text-muted-foreground">{t("submissionRecentReviews")}</p>
    <Dialog open={review !== null} busy={busy} onOpenChange={(value) => { if (!value) setReview(null); }} title={t("submissionReason")} description={t("submissionReviewReasonHelp")}>
      <label className="mb-2 mt-4 block text-xs" htmlFor="review-reason">{t("submissionReason")}</label><textarea id="review-reason" minLength={3} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-border bg-card p-3 text-sm" />
      {error && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{t(error)}</p>}<div className="mt-4 flex justify-end"><Button loading={busy} disabled={reason.trim().length < 3} onClick={() => { void save(); }}>{t("submissionSend")}</Button></div></Dialog>
  </AppShell>;
}
