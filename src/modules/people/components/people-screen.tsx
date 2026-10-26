"use client";
import Link from "next/link";
import { memo, useCallback, useState } from "react";
import { Ban, Eye, Mail, MapPin, PencilLine, Phone, Plus, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CollectorForm } from "@/modules/people/components/collector-form";
import { CollectorRequests } from "@/modules/people/components/collector-requests";
import { collectorLabels, peopleError, peopleRequest } from "@/modules/people/people.client";
import { collectorDeleteResponseSchema, collectorEligibilityResponseSchema, collectorsResponseSchema } from "@/modules/people/people.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { CollectorPage, CollectorQuery, CollectorRow, CollectorValues } from "@/modules/people/people.schema";
import type { MessageKey } from "@/lib/i18n/messages";

function photoUrl(collector: CollectorRow) { return `/api/v1/people/${collector.id}/photo?v=${encodeURIComponent(collector.updatedAt)}`; }
function statusLabel(status: CollectorRow["status"]): MessageKey {
  return status === "ACTIVE" ? "usersActive" : status === "BLOCKED" ? "usersBlocked" : "usersInactive";
}
function reconcile(previous: CollectorPage | undefined, next: CollectorPage): CollectorPage {
  const rows = new Map(previous?.collectors.map((collector) => [collector.id, collector]));
  return { ...next, collectors: next.collectors.map((collector) => {
    const cached = rows.get(collector.id);
    return cached && JSON.stringify(cached) === JSON.stringify(collector) ? cached : collector;
  }) };
}
function CollectorEligibility({ collector, admin, onChange }: {
  collector: CollectorRow; admin: boolean; onChange: (collector: CollectorRow) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  async function toggle() {
    if (!admin || saving) return;
    setSaving(true); setError(null);
    try { await onChange(collector); }
    catch (failure) { setError(peopleError(failure)); }
    finally { setSaving(false); }
  }
  return <div className="w-full rounded-lg border border-border bg-muted/40 px-2.5 py-2">
    <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium" title={t("peopleLeftoverHelp")}>
      <input type="checkbox" role="switch" className="order-last size-3.5 shrink-0 accent-primary disabled:cursor-not-allowed" checked={collector.leftoverEligible}
        disabled={!admin || saving} aria-busy={saving || undefined} onChange={() => { void toggle(); }} />
      <span className="flex-1">{t("peopleLeftoverEligible")}</span>
      {saving && <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" role="status" aria-label={t("usersSaving")} />}
    </label>
    {error && <p className="mt-2 text-[11px] text-[var(--danger)]" role="alert">{t(error)}</p>}
  </div>;
}

const CollectorCard = memo(function CollectorCard({ collector, admin, onView, onEdit, onDelete, onEligibilityChange, onStatusChange }: {
  collector: CollectorRow; admin: boolean; onView: (collector: CollectorRow) => void; onEdit: (collector: CollectorRow) => void; onDelete: (collector: CollectorRow) => void;
  onEligibilityChange: (collector: CollectorRow) => Promise<void>; onStatusChange: (collector: CollectorRow) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusError, setStatusError] = useState<MessageKey | null>(null);
  const actionLabel = collector.status === "BLOCKED" ? "peopleUnblock" : collector.status === "INACTIVE" ? "peopleActivate" : "peopleBlockAction";
  const location = [collector.village, collector.district].filter(Boolean).join(", ") || collector.collectionAreaName || "—";
  async function changeStatus() {
    if (!admin || changingStatus) return;
    setChangingStatus(true); setStatusError(null);
    try { await onStatusChange(collector); setConfirmingStatus(false); }
    catch (failure) { setStatusError(peopleError(failure)); }
    finally { setChangingStatus(false); }
  }
  return <>
    <Card className="flex min-w-0 flex-col overflow-hidden p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-primary" aria-hidden="true">
          <UserRound size={21} strokeWidth={1.6} />
          {collector.hasPhoto && <img alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover"
            src={photoUrl(collector)} onError={(event) => { event.currentTarget.hidden = true; }} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold" title={collector.fullName}>{collector.fullName}</h3>
          <p className="mt-0.5 text-xs font-medium tabular-nums text-primary" dir="ltr">{collector.code}</p>
        </div>
        <Badge tone={collector.status === "ACTIVE" ? "success" : collector.status === "BLOCKED" ? "danger" : "neutral"}>{t(statusLabel(collector.status))}</Badge>
      </div>
      <div className="my-3 grid gap-1.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-2"><Phone size={13} strokeWidth={1.6} aria-hidden="true" /><span dir="ltr">{collector.phone || "—"}</span></p>
        <p className="flex min-w-0 items-center gap-2" title={location}><MapPin size={13} strokeWidth={1.6} className="shrink-0" aria-hidden="true" /><span className="truncate">{location}</span></p>
        {collector.email && <p className="flex min-w-0 items-center gap-2" title={collector.email}><Mail size={13} strokeWidth={1.6} className="shrink-0" aria-hidden="true" /><span className="truncate" dir="ltr">{collector.email}</span></p>}
      </div>
      <div className="mt-auto">
        <CollectorEligibility collector={collector} admin={admin} onChange={onEligibilityChange} />
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-border pt-2 [&_.button-icon]:size-8 [&_.button-icon]:min-h-8 [&_.button-icon]:p-1.5">
          <Button variant="ghost" size="icon" title={t("usersView")} aria-label={`${t("usersView")} ${collector.fullName}`} onClick={() => onView(collector)}><Eye size={16} strokeWidth={1.6} /></Button>
          <Button variant="ghost" size="icon" title={t(admin ? "usersEdit" : "peopleRequestEdit")}
            aria-label={`${t(admin ? "usersEdit" : "peopleRequestEdit")} ${collector.fullName}`} onClick={() => onEdit(collector)}><PencilLine size={16} strokeWidth={1.6} /></Button>
          {admin && <Button variant="ghost" size="icon" disabled={changingStatus} title={t(actionLabel)}
            className={collector.status === "ACTIVE" ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]" : "text-primary"}
            aria-label={`${t(actionLabel)} ${collector.fullName}`} onClick={() => { setStatusError(null); setConfirmingStatus(true); }}>
            {collector.status === "ACTIVE" ? <Ban size={16} strokeWidth={1.6} /> : <ShieldCheck size={16} strokeWidth={1.6} />}
          </Button>}
          {admin && <Button variant="ghost" size="icon" disabled={changingStatus} title={t("peopleDelete")}
            className="text-[var(--danger)] hover:bg-[var(--danger-soft)]" aria-label={`${t("peopleDelete")} ${collector.fullName}`}
            onClick={() => onDelete(collector)}><Trash2 size={16} strokeWidth={1.6} /></Button>}
        </div>
      </div>
    </Card>
    <Dialog open={confirmingStatus} busy={changingStatus} onOpenChange={setConfirmingStatus}
      className="w-[min(420px,calc(100vw-32px))] [&_.dialog-description]:text-sm" title={t(actionLabel)}
      description={t(collector.status === "ACTIVE" ? "peopleConfirmBlock" : "peopleConfirmActivate")}>
      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-sm font-semibold">{collector.fullName}</p><p className="mt-1 text-xs text-primary" dir="ltr">{collector.code}</p>
      </div>
      {statusError && <p className="mt-3 text-xs text-[var(--danger)]" role="alert">{t(statusError)}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" size="small" disabled={changingStatus} onClick={() => setConfirmingStatus(false)}>{t("peopleDeleteCancel")}</Button>
        <Button size="small" loading={changingStatus} onClick={() => { void changeStatus(); }}
          className={collector.status === "ACTIVE" ? "bg-[var(--danger)] text-white hover:bg-[var(--danger)]" : undefined}>{t(actionLabel)}</Button>
      </div>
    </Dialog>
  </>;
});

export function PeopleScreen({ account }: { account: Account }) {
  const { t } = useLanguage();
  const cache = usePageDataCache();
  const scope = `${account.id}:people:`;
  const admin = account.role === "SUPER_ADMIN";
  const [search, setSearch] = usePageState(`${scope}search`, "");
  const [status, setStatus] = usePageState<CollectorQuery["status"]>(`${scope}status`, "ALL");
  const [sort, setSort] = usePageState<CollectorQuery["sort"]>(`${scope}sort`, "CODE_ASC");
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const [tab, setTab] = usePageState<"collectors" | "requests">(`${scope}tab`, "collectors");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CollectorRow | undefined>();
  const [viewing, setViewing] = useState<CollectorRow | null>(null);
  const [deleting, setDeleting] = useState<CollectorRow | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const params = new URLSearchParams({ search: search.trim(), status, sort, page: String(page) }).toString();
  const queryKey = `${scope}query:fundraisers:${params}`;
  const fetchCollectors = useCallback(async (): Promise<CollectorPage> => {
    const result = collectorsResponseSchema.parse(await peopleRequest(`/api/v1/people?${params}`));
    return { collectors: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(queryKey, fetchCollectors, { enabled: tab === "collectors" && !open,
    delay: search ? 300 : 0, reconcile });
  const data = query.data;
  const loading = query.loading || query.stale;
  const view = useCallback((collector: CollectorRow) => setViewing(collector), []);
  const edit = useCallback((collector: CollectorRow) => { setEditing(collector); setViewing(null); setOpen(true); }, []);
  const beginDelete = useCallback((collector: CollectorRow) => {
    setViewing(null); setDeleteName(""); setDeleteError(null); setDeleting(collector);
  }, []);
  const invalidate = useCallback(() => {
    cache.invalidate(`${scope}query:`); cache.invalidate(`${scope}eligible:query:`);
    cache.invalidate(`${account.id}:leftovers:options:`);
  }, [cache, scope, account.id]);
  const changeEligibility = useCallback(async (collector: CollectorRow) => {
    if (!admin) throw new Error("ACCESS_DENIED");
    const updated = collectorEligibilityResponseSchema.parse(await peopleRequest(`/api/v1/people/${collector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leftoverEligible: !collector.leftoverEligible, version: collector.updatedAt }),
    })).data;
    cache.updateQueries<CollectorPage>(`${scope}query:`, (previous) => ({ ...previous,
      collectors: previous.collectors.map((row) => row.id === updated.id ? updated : row) }));
    cache.invalidate(`${scope}query:assignment-options:`);
    cache.invalidate(`${scope}eligible:query:`);
    cache.invalidate(`${account.id}:leftovers:options:`);
    setViewing((previous) => previous?.id === updated.id ? updated : previous);
    setNotice("peopleEligibilitySaved");
  }, [admin, cache, scope, account.id]);

  const changeStatus = useCallback(async (collector: CollectorRow) => {
    if (!admin) throw new Error("ACCESS_DENIED");
    const updated = collectorEligibilityResponseSchema.parse(await peopleRequest(`/api/v1/people/${collector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: collector.status === "ACTIVE" ? "BLOCKED" : "ACTIVE", version: collector.updatedAt }),
    })).data;
    // Invalidate related pickers; keep this screen fresh with only the changed card.
    cache.invalidate(`${scope}query:`);
    cache.invalidate(`${scope}eligible:query:`);
    cache.invalidate(`${account.id}:leftovers:options:`);
    if (data) {
      const matches = status === "ALL" || status === updated.status;
      const exists = data.collectors.some((row) => row.id === updated.id);
      const rows = data.collectors.flatMap((row) => row.id !== updated.id ? [row] : matches ? [updated] : []);
      cache.setQueryData(queryKey, { ...data, collectors: rows, total: Math.max(0, data.total - (exists && !matches ? 1 : 0)) });
      if (exists && !matches && rows.length === 0 && data.page > 1) setPage(data.page - 1);
    }
    setViewing((previous) => previous?.id === updated.id ? updated : previous);
    setNotice("peopleStatusSaved");
  }, [admin, cache, scope, account.id, data, status, queryKey, setPage]);

  async function removeCollector() {
    if (!admin || !deleting || deleteBusy || deleteName.trim() !== deleting.fullName) return;
    setDeleteBusy(true); setDeleteError(null);
    try {
      const result = collectorDeleteResponseSchema.parse(await peopleRequest(`/api/v1/people/${deleting.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: deleting.updatedAt }),
      })).data;
      cache.updateQueries<CollectorPage>(`${scope}query:`, (previous) => {
        const removed = previous.collectors.some((row) => row.id === result.id);
        return { ...previous, collectors: previous.collectors.filter((row) => row.id !== result.id),
          total: Math.max(0, previous.total - (removed ? 1 : 0)) };
      });
      invalidate();
      cache.invalidate(`${scope}requests:`);
      cache.invalidate(`${account.id}:dashboard:`);
      if (data?.collectors.length === 1 && data.page > 1) setPage(data.page - 1);
      setDeleting(null);
      setNotice(result.photoCleanupPending ? "peopleDeletePhotoPending" : "peopleDeleted");
    } catch (failure) { setDeleteError(peopleError(failure)); }
    finally { setDeleteBusy(false); }
  }

  function saved(collector: CollectorRow, requested: boolean) {
    if (requested) {
      cache.invalidate(`${scope}requests:`); setNotice("peopleRequestSaved");
    } else {
      if (data) {
        const exists = data.collectors.some((row) => row.id === collector.id);
        const term = search.trim().toLowerCase();
        const matches = (status === "ALL" || status === collector.status)
          && [collector.fullName, collector.phone, collector.email, collector.code].some((value) => value.toLowerCase().includes(term));
        const added = !editing && !exists && matches && data.page === 1;
        const removed = exists && !matches;
        const rows = exists ? data.collectors.flatMap((row) => row.id !== collector.id ? [row] : matches ? [collector] : [])
          : added ? [collector, ...data.collectors].slice(0, data.pageSize) : data.collectors;
        cache.setQueryData(queryKey, { ...data, collectors: rows, total: data.total + (added ? 1 : removed ? -1 : 0) });
      }
      invalidate(); setNotice(editing ? "peopleSaved" : "peopleCreated");
    }
    setOpen(false); setBusy(false);
    if (!editing && !requested) setViewing(collector);
  }

  function profileValue(key: keyof CollectorValues, collector: CollectorRow) {
    const value = collector[key];
    if (key === "status") return t(statusLabel(collector.status));
    if (key === "gender" && collector.gender === "UNSPECIFIED") return "—";
    if (key === "gender") return t(collector.gender === "MALE" ? "usersMale" : collector.gender === "FEMALE" ? "usersFemale" : "usersOther");
    if (key === "language") return collector.language === "ur" ? "اردو" : "English";
    return key === "commission" && value !== "" ? `${value}%` : value || "—";
  }
  return <AppShell account={account} headerTitle="people" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("people")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("peopleDescription")}</p></div>
    </div>
    {notice && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] users-notice mb-[var(--space-gap)]"} role="status">{t(notice)}</p>}
    <div className="mb-5 flex items-center justify-between gap-3">
      <Button variant={tab === "collectors" ? "default" : "outline"} aria-pressed={tab === "collectors"} onClick={() => setTab("collectors")}>{t("peopleCollectors")}</Button>
      <div className="flex items-center gap-2">
        <Button variant={tab === "requests" ? "default" : "outline"} aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>{t("peopleRequests")}</Button>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={17} aria-hidden="true" />{t("peopleAdd")}</Button>
      </div>
    </div>
    {tab === "requests" ? <CollectorRequests accountId={account.id} admin={admin} onChanged={invalidate} /> : <>
      <Card className="overflow-x-auto p-3 [scrollbar-width:thin]">
        <div className="grid min-w-[500px] grid-cols-[minmax(180px,1fr)_150px_150px] items-center gap-3">
          <label className="relative min-w-0"><Search size={17} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" className="w-full ps-10" aria-label={t("peopleSearch")} placeholder={t("peopleSearch")} value={search} maxLength={100}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          </label>
          <select className="h-[47px] w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={t("status")} value={status} onChange={(event) => {
              const value = event.target.value;
              if (value === "ALL" || value === "ACTIVE" || value === "INACTIVE" || value === "BLOCKED") { setStatus(value); setPage(1); }
            }}><option value="ALL">{t("peopleAllStatuses")}</option><option value="ACTIVE">{t("usersActive")}</option>
            <option value="INACTIVE">{t("usersInactive")}</option><option value="BLOCKED">{t("usersBlocked")}</option></select>
          <select className="h-[47px] w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={t("peopleSort")} value={sort} onChange={(event) => {
              const value = event.target.value;
              if (value === "CODE_ASC" || value === "NAME_ASC") { setSort(value); setPage(1); }
            }}><option value="CODE_ASC">{t("peopleSortCode")}</option><option value="NAME_ASC">{t("peopleSortAZ")}</option></select>
        </div>
      </Card>
      <div className={"users-results-heading flex items-center justify-between gap-[15px] my-[24px_17px] text-[length:12px] min-h-[24px] [&_>_span:first-child]:flex [&_>_span:first-child]:items-center [&_>_span:first-child]:gap-[9px] [&_>_span:first-child]:font-semibold [&_strong]:p-[3px_9px] [&_strong]:bg-[var(--accent)] [&_strong]:text-[color:var(--primary)] [&_strong]:rounded-[var(--radius-pill)]"}><span>{t("peopleCollectors")}{data && <strong>{data.total}</strong>}</span>
        <span className={"muted text-[color:var(--muted-foreground)]"} role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
      {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(peopleError(query.error))}</p>}
      <section className={"users-card-grid grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-3 min-[1450px]:grid-cols-4"} aria-label={t("peopleCollectors")} aria-busy={loading}>
        {data?.collectors.map((collector) => <CollectorCard key={collector.id} collector={collector} admin={admin} onView={view} onEdit={edit} onDelete={beginDelete} onEligibilityChange={changeEligibility} onStatusChange={changeStatus} />)}
        {!data && loading && Array.from({ length: 8 }, (_, index) => <Card key={index} className="min-h-[218px] animate-pulse p-3.5" aria-hidden="true">
          <div className="flex items-center gap-2.5"><span className="size-11 rounded-full bg-muted" /><span className="h-4 w-1/2 rounded bg-muted" /></div>
          <div className="my-4 grid gap-2"><span className="h-3 w-1/2 rounded bg-muted" /><span className="h-3 w-3/4 rounded bg-muted" /></div>
          <div className="h-8 rounded-lg bg-muted" /><div className="mt-3 h-7 rounded bg-muted" />
        </Card>)}
      </section>
      {!loading && data?.collectors.length === 0 && <Card className={"users-empty p-[44px_20px] text-center text-[color:var(--muted-foreground)]"}>{t("peopleEmpty")}</Card>}
      {data && <div className={"users-pagination flex items-center justify-between gap-[var(--space-gap)] pt-[24px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
        <div className={"header-actions flex items-center gap-[12px]"}><Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
          <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    </>}
    <Dialog open={open} busy={busy} onOpenChange={(value) => { if (!value) setOpen(false); }} className={"users-editor-dialog w-[min(780px,_calc(100vw_-_40px))] max-h-[90vh] [&_.dialog-description]:text-[length:12px] [&_.dialog-description]:max-w-[620px]"}
      title={t(editing ? admin ? "usersEdit" : "peopleRequestEdit" : "peopleAdd")} description={t("peopleNoLogin")}>
      {open && <CollectorForm collector={editing} admin={admin} onBusyChange={setBusy} onSaved={saved} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }} className={"users-editor-dialog w-[min(780px,_calc(100vw_-_40px))] max-h-[90vh] [&_.dialog-description]:text-[length:12px] [&_.dialog-description]:max-w-[620px]"}
      title={t("peopleProfile")} description={t("peopleNoLogin")}>
      {viewing && <div className={"users-profile-details flex flex-col items-center gap-[12px] pt-[24px] [&_.user-card-avatar]:mt-0 [&_dl]:w-full [&_dl]:my-[12px] [&_dl_>_div]:grid [&_dl_>_div]:grid-cols-[120px_1fr] [&_dl_>_div]:gap-[15px] [&_dl_>_div]:[border-top:1px_solid_var(--border)] [&_dl_>_div]:py-[13px] [&_dt]:text-[color:var(--muted-foreground)] [&_dt]:text-[length:12px] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:whitespace-pre-wrap [&_dd]:text-[length:12px]"}><span className={"user-card-avatar relative inline-flex items-center justify-center w-[88px] h-[88px] mt-[-43px] shrink-0 [border:5px_solid_var(--card)] rounded-[50%] bg-[var(--accent)] text-[color:var(--primary)] overflow-hidden [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover"}><UserRound size={36} />
        {viewing.hasPhoto && <img alt={viewing.fullName} src={photoUrl(viewing)} />}</span>
        <h3>{viewing.fullName}</h3><p className={"muted text-[color:var(--muted-foreground)]"} dir="ltr">{viewing.code}</p>
        <CollectorEligibility key={viewing.id} collector={viewing} admin={admin} onChange={changeEligibility} />
        <dl>{viewing.collectionAreaName && <div><dt>{t("assignAreas")}</dt><dd>{viewing.collectionAreaName}</dd></div>}{(Object.keys(collectorLabels) as (keyof CollectorValues)[]).map((key) => <div key={key}>
          <dt>{t(collectorLabels[key])}</dt><dd dir={key === "phone" || key === "email" || key === "whatsapp" || key === "pin" ? "ltr" : undefined}>{profileValue(key, viewing)}</dd></div>)}</dl>
        <div className={"people-book-placeholder w-full p-[20px] bg-[var(--muted)] rounded-[var(--radius)] grid gap-[12px] [&_.muted]:text-[length:12px] [&_.muted]:leading-[1.8] [&_.button]:[justify-self:start]"}><h3>{t("peopleAssignBooks")}</h3><p className={"muted text-[color:var(--muted-foreground)]"}>{t("assignProfileHelp")}</p>
          {viewing.status === "ACTIVE" && <Button asChild variant="outline"><Link href={`/books/assignments?fundraiser=${viewing.id}&code=${encodeURIComponent(viewing.code)}`}>{t("peopleAssignBooks")}</Link></Button>}</div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => edit(viewing)}>{t(admin ? "usersEdit" : "peopleRequestEdit")}</Button>
          {admin && <Button variant="outline" className="border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            onClick={() => beginDelete(viewing)}><Trash2 size={16} />{t("peopleDelete")}</Button>}
        </div>
      </div>}
    </Dialog>
    <Dialog open={deleting !== null} busy={deleteBusy} onOpenChange={(value) => { if (!value && !deleteBusy) setDeleting(null); }}
      className="w-[min(480px,calc(100vw-32px))]" title={t("peopleDelete")} description={t("peopleDeleteHelp")}>
      {deleting && <form className="grid gap-4 pt-5" onSubmit={(event) => { event.preventDefault(); void removeCollector(); }} aria-busy={deleteBusy}>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
          <p className="font-semibold">{deleting.fullName}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{deleting.code}</p>
        </div>
        <div><label htmlFor="fundraiser-delete-name" className="mb-2 block text-xs font-semibold">{t("peopleDeleteConfirmName")}</label>
          <Input id="fundraiser-delete-name" value={deleteName} maxLength={100} autoComplete="off" disabled={deleteBusy}
            onChange={(event) => setDeleteName(event.target.value)} /></div>
        {deleteError && <p role="alert" className="text-xs leading-relaxed text-[var(--danger)]">{t(deleteError)}</p>}
        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>{t("peopleDeleteCancel")}</Button>
          <Button type="submit" loading={deleteBusy} disabled={deleteName.trim() !== deleting.fullName}
            className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]"><Trash2 size={16} />{t(deleteBusy ? "peopleDeleting" : "peopleDeleteAction")}</Button>
        </div>
      </form>}
    </Dialog>
  </AppShell>;
}
