"use client";
import { useCallback, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { AuthField } from "@/modules/auth/components/auth-field";
import { collectorLabels, peopleError, peopleRequest } from "@/modules/people/people.client";
import { collectorRequestsResponseSchema } from "@/modules/people/people.schema";
import type { CollectorRequest, CollectorValues } from "@/modules/people/people.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function CollectorRequests({ accountId, admin, onChanged }: { accountId: string; admin: boolean; onChanged: () => void }) {
  const { t, language } = useLanguage();
  const cache = usePageDataCache();
  const [page, setPage] = usePageState(`${accountId}:people:request-page`, 1);
  const [selected, setSelected] = useState<CollectorRequest | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const fetchRequests = useCallback(async () => collectorRequestsResponseSchema.parse(await peopleRequest(`/api/v1/people/requests?page=${page}`)), [page]);
  const query = usePageQuery(`${accountId}:people:requests:${page}`, fetchRequests);
  const loading = query.loading || query.stale;
  const data = query.data;
  async function review(decision: "APPROVED" | "REJECTED") {
    if (!selected || busy || note.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      await peopleRequest(`/api/v1/people/requests/${selected.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }) });
      cache.invalidate(`${accountId}:people:requests:`); onChanged(); setSelected(null);
    } catch (error) { setError(peopleError(error)); }
    finally { setBusy(false); }
  }
  function value(key: keyof CollectorValues, raw: string) {
    return key === "status" ? t(raw === "ACTIVE" ? "usersActive" : raw === "BLOCKED" ? "usersBlocked" : "usersInactive")
      : key === "gender" ? t(raw === "MALE" ? "usersMale" : raw === "FEMALE" ? "usersFemale" : "usersOther")
      : key === "language" ? raw === "ur" ? "اردو" : "English" : raw || "—";
  }
  return <>
    <div className={"people-request-heading flex items-center justify-between gap-[16px] mb-[18px] [&_p]:text-[length:12px]"}><p className={"muted text-[color:var(--muted-foreground)]"}>{t(admin ? "peopleRequestsAdmin" : "peopleRequestsStaff")}</p>
      <Button variant="outline" size="small" loading={loading} onClick={() => cache.invalidate(`${accountId}:people:requests:`)}>{t("usersRefresh")}</Button></div>
    {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(peopleError(query.error))}</p>}
    {!data && loading && <Card className={"users-empty p-[44px_20px] text-center text-[color:var(--muted-foreground)]"} role="status">{t("working")}</Card>}
    {data && <Card className={"people-request-table overflow-hidden"}><div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end"}>
      <thead><tr><th>{t("peopleCollector")}</th><th>{t("peopleRequestedBy")}</th><th>{t("date")}</th><th>{t("status")}</th><th>{t("usersActions")}</th></tr></thead>
      <tbody>{data.data.map((request) => <tr key={request.id}><td>{request.collectorName}</td><td>{request.requestedByName || "—"}</td>
        <td>{new Intl.DateTimeFormat(language === "ur" ? "ur-IN-u-nu-latn" : "en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(request.createdAt))}</td>
        <td><Badge tone={request.status === "APPROVED" ? "success" : request.status === "REJECTED" ? "danger" : "warning"}>
          {t(request.status === "APPROVED" ? "peopleApproved" : request.status === "REJECTED" ? "peopleRejected" : "pending")}</Badge></td>
        <td><Button variant="outline" size="small" onClick={() => { setError(null); setNote(""); setSelected(request); }}>{t("peopleReview")}</Button></td></tr>)}</tbody>
    </table></div>{data.data.length === 0 && <p className={"users-empty p-[44px_20px] text-center text-[color:var(--muted-foreground)]"}>{t("peopleNoRequests")}</p>}</Card>}
    {data && <div className={"users-pagination flex items-center justify-between gap-[var(--space-gap)] pt-[24px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.meta.page} / {Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize))}</span>
      <div className={"header-actions flex items-center gap-[12px]"}><Button variant="outline" size="small" disabled={loading || data.meta.page <= 1} onClick={() => setPage(data.meta.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.meta.page * data.meta.pageSize >= data.meta.total} onClick={() => setPage(data.meta.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={selected !== null} busy={busy} onOpenChange={(open) => { if (!open) setSelected(null); }} className={"users-editor-dialog w-[min(780px,_calc(100vw_-_40px))] max-h-[90vh] [&_.dialog-description]:text-[length:12px] [&_.dialog-description]:max-w-[620px]"}
      title={t("peopleReview")} description={t("peopleReviewHelp")}>
      {selected && <div className={"people-review grid gap-[20px] pt-[20px]"}><h3>{selected.collectorName}</h3><p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"}>{selected.reason}</p>
        <div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end people-comparison [&_td]:whitespace-pre-wrap [&_td]:[overflow-wrap:anywhere] [&_td]:min-w-[160px] [&_td]:max-w-[250px]"}><thead><tr><th>{t("peopleField")}</th><th>{t("peopleBefore")}</th><th>{t("peopleAfter")}</th></tr></thead>
          <tbody>{(Object.keys(collectorLabels) as (keyof CollectorValues)[]).filter((key) => selected.oldValues[key] !== selected.newValues[key]).map((key) =>
            <tr key={key}><th>{t(collectorLabels[key])}</th><td>{value(key, selected.oldValues[key])}</td><td>{value(key, selected.newValues[key])}</td></tr>)}</tbody></table></div>
        {selected.photoChanged && selected.status === "PENDING" && <div className={"people-photo-comparison grid grid-cols-[repeat(2,_1fr)] gap-[20px] [&_img]:w-[100px] [&_img]:h-[100px] [&_img]:object-cover [&_img]:rounded-[var(--radius)] [&_img]:mt-[10px]"}><div><p>{t("peopleCurrentPhoto")}</p>
          <img alt={t("peopleCurrentPhoto")} src={`/api/v1/people/${selected.collectorId}/photo`} onError={(event) => { event.currentTarget.hidden = true; }} /></div>
          <div><p>{t("peopleRequestedPhoto")}</p>{selected.newHasPhoto
            ? <img alt={t("peopleRequestedPhoto")} src={`/api/v1/people/${selected.collectorId}/photo?request=${selected.id}`} /> : "—"}</div></div>}
        {selected.reviewNote && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"}>{selected.reviewNote}</p>}
        {admin && selected.status === "PENDING" && <><AuthField id="collector-review-note" label={t("peopleReviewNote")} required maxLength={500}
          value={note} onChange={(event) => setNote(event.target.value)} hint={t("peopleReasonHint")} />
          <div className={"dialog-actions flex gap-[10px] flex-wrap mt-[24px]"}><Button loading={busy} disabled={note.trim().length < 3} onClick={() => void review("APPROVED")}>{t("peopleApprove")}</Button>
            <Button variant="outline" disabled={busy || note.trim().length < 3} onClick={() => void review("REJECTED")}>{t("peopleReject")}</Button></div></>}
        {error && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(error)}</p>}
      </div>}
    </Dialog>
  </>;
}
