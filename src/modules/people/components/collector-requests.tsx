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
    <div className="people-request-heading"><p className="muted">{t(admin ? "peopleRequestsAdmin" : "peopleRequestsStaff")}</p>
      <Button variant="outline" size="small" loading={loading} onClick={() => cache.invalidate(`${accountId}:people:requests:`)}>{t("usersRefresh")}</Button></div>
    {query.error != null && <p className="form-message auth-error" role="alert">{t(peopleError(query.error))}</p>}
    {!data && loading && <Card className="users-empty" role="status">{t("working")}</Card>}
    {data && <Card className="people-request-table"><div className="table-container"><table className="data-table">
      <thead><tr><th>{t("peopleCollector")}</th><th>{t("peopleRequestedBy")}</th><th>{t("date")}</th><th>{t("status")}</th><th>{t("usersActions")}</th></tr></thead>
      <tbody>{data.data.map((request) => <tr key={request.id}><td>{request.collectorName}</td><td>{request.requestedByName || "—"}</td>
        <td>{new Intl.DateTimeFormat(language === "ur" ? "ur-IN-u-nu-latn" : "en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(request.createdAt))}</td>
        <td><Badge tone={request.status === "APPROVED" ? "success" : request.status === "REJECTED" ? "danger" : "warning"}>
          {t(request.status === "APPROVED" ? "peopleApproved" : request.status === "REJECTED" ? "peopleRejected" : "pending")}</Badge></td>
        <td><Button variant="outline" size="small" onClick={() => { setError(null); setNote(""); setSelected(request); }}>{t("peopleReview")}</Button></td></tr>)}</tbody>
    </table></div>{data.data.length === 0 && <p className="users-empty">{t("peopleNoRequests")}</p>}</Card>}
    {data && <div className="users-pagination"><span className="muted">{t("usersPage")} {data.meta.page} / {Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize))}</span>
      <div className="header-actions"><Button variant="outline" size="small" disabled={loading || data.meta.page <= 1} onClick={() => setPage(data.meta.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.meta.page * data.meta.pageSize >= data.meta.total} onClick={() => setPage(data.meta.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={selected !== null} busy={busy} onOpenChange={(open) => { if (!open) setSelected(null); }} className="users-editor-dialog"
      title={t("peopleReview")} description={t("peopleReviewHelp")}>
      {selected && <div className="people-review"><h3>{selected.collectorName}</h3><p className="form-message">{selected.reason}</p>
        <div className="table-container"><table className="data-table people-comparison"><thead><tr><th>{t("peopleField")}</th><th>{t("peopleBefore")}</th><th>{t("peopleAfter")}</th></tr></thead>
          <tbody>{(Object.keys(collectorLabels) as (keyof CollectorValues)[]).filter((key) => selected.oldValues[key] !== selected.newValues[key]).map((key) =>
            <tr key={key}><th>{t(collectorLabels[key])}</th><td>{value(key, selected.oldValues[key])}</td><td>{value(key, selected.newValues[key])}</td></tr>)}</tbody></table></div>
        {selected.photoChanged && selected.status === "PENDING" && <div className="people-photo-comparison"><div><p>{t("peopleCurrentPhoto")}</p>
          <img alt={t("peopleCurrentPhoto")} src={`/api/v1/people/${selected.collectorId}/photo`} onError={(event) => { event.currentTarget.hidden = true; }} /></div>
          <div><p>{t("peopleRequestedPhoto")}</p>{selected.newHasPhoto
            ? <img alt={t("peopleRequestedPhoto")} src={`/api/v1/people/${selected.collectorId}/photo?request=${selected.id}`} /> : "—"}</div></div>}
        {selected.reviewNote && <p className="form-message">{selected.reviewNote}</p>}
        {admin && selected.status === "PENDING" && <><AuthField id="collector-review-note" label={t("peopleReviewNote")} required maxLength={500}
          value={note} onChange={(event) => setNote(event.target.value)} hint={t("peopleReasonHint")} />
          <div className="dialog-actions"><Button loading={busy} disabled={note.trim().length < 3} onClick={() => void review("APPROVED")}>{t("peopleApprove")}</Button>
            <Button variant="outline" disabled={busy || note.trim().length < 3} onClick={() => void review("REJECTED")}>{t("peopleReject")}</Button></div></>}
        {error && <p className="form-message auth-error" role="alert">{t(error)}</p>}
      </div>}
    </Dialog>
  </>;
}
