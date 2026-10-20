"use client";
import { memo, useCallback, useState } from "react";
import { Eye, Mail, MapPin, PencilLine, Plus, RefreshCw, Search, UserRound } from "lucide-react";
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
import { collectorsResponseSchema } from "@/modules/people/people.schema";
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
const CollectorCard = memo(function CollectorCard({ collector, admin, onView, onEdit }: {
  collector: CollectorRow; admin: boolean; onView: (collector: CollectorRow) => void; onEdit: (collector: CollectorRow) => void;
}) {
  const { t } = useLanguage();
  return <Card className="user-profile-card"><div className="user-card-cover">
    <Badge tone={collector.status === "ACTIVE" ? "success" : collector.status === "BLOCKED" ? "danger" : "neutral"}>{t(statusLabel(collector.status))}</Badge>
    <span className="user-card-self" dir="ltr">{collector.code}</span></div>
    <div className="user-card-body"><span className="user-card-avatar" aria-hidden="true"><UserRound size={35} />
      {collector.hasPhoto && <img alt="" loading="lazy" decoding="async" src={photoUrl(collector)} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
      <h3>{collector.fullName}</h3><span className="user-card-role">{t("peopleCollector")}</span>
      <div className="user-card-contact"><p><span dir="ltr">{collector.phone}</span></p>
        <p><MapPin size={15} aria-hidden="true" /><span>{collector.village}, {collector.district}</span></p>
        {collector.email && <p><Mail size={15} aria-hidden="true" /><span dir="ltr">{collector.email}</span></p>}</div>
      <div className="user-card-actions"><Button variant="outline" size="small" onClick={() => onView(collector)}><Eye size={15} />{t("usersView")}</Button>
        <Button variant="outline" size="small" onClick={() => onEdit(collector)}><PencilLine size={15} />{t(admin ? "usersEdit" : "peopleRequestEdit")}</Button></div>
    </div></Card>;
});

export function PeopleScreen({ account }: { account: Account }) {
  const { t } = useLanguage();
  const cache = usePageDataCache();
  const scope = `${account.id}:people:`;
  const admin = account.role === "ADMIN";
  const [search, setSearch] = usePageState(`${scope}search`, "");
  const [area, setArea] = usePageState(`${scope}area`, "");
  const [status, setStatus] = usePageState<CollectorQuery["status"]>(`${scope}status`, "ALL");
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const [tab, setTab] = usePageState<"collectors" | "requests">(`${scope}tab`, "collectors");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CollectorRow | undefined>();
  const [viewing, setViewing] = useState<CollectorRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const params = new URLSearchParams({ search: search.trim(), area: area.trim(), status, page: String(page) }).toString();
  const queryKey = `${scope}query:${params}`;
  const fetchCollectors = useCallback(async (): Promise<CollectorPage> => {
    const result = collectorsResponseSchema.parse(await peopleRequest(`/api/v1/people?${params}`));
    return { collectors: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(queryKey, fetchCollectors, { enabled: tab === "collectors" && !open,
    delay: search || area ? 300 : 0, reconcile });
  const data = query.data;
  const loading = query.loading || query.stale;
  const view = useCallback((collector: CollectorRow) => setViewing(collector), []);
  const edit = useCallback((collector: CollectorRow) => { setEditing(collector); setViewing(null); setOpen(true); }, []);
  const invalidate = useCallback(() => { cache.invalidate(`${scope}query:`); }, [cache, scope]);

  function saved(collector: CollectorRow, requested: boolean) {
    if (requested) {
      cache.invalidate(`${scope}requests:`); setNotice("peopleRequestSaved");
    } else {
      if (data) {
        const exists = data.collectors.some((row) => row.id === collector.id);
        const term = search.trim().toLowerCase();
        const location = area.trim().toLowerCase();
        const matches = (status === "ALL" || status === collector.status)
          && [collector.fullName, collector.phone, collector.email, collector.code].some((value) => value.toLowerCase().includes(term))
          && [collector.village, collector.district, collector.block].some((value) => value.toLowerCase().includes(location));
        const added = !editing && !exists && matches && data.page === 1;
        const removed = exists && !matches;
        const rows = exists ? data.collectors.flatMap((row) => row.id !== collector.id ? [row] : matches ? [collector] : [])
          : added ? [collector, ...data.collectors].slice(0, data.pageSize) : data.collectors;
        cache.setQueryData(queryKey, { ...data, collectors: rows, total: data.total + (added ? 1 : removed ? -1 : 0) });
      }
      invalidate(); setNotice(editing ? "peopleSaved" : "peopleCreated");
    }
    setOpen(false); setBusy(false);
  }

  function profileValue(key: keyof CollectorValues, collector: CollectorRow) {
    const value = collector[key];
    if (key === "status") return t(statusLabel(collector.status));
    if (key === "gender") return t(collector.gender === "MALE" ? "usersMale" : collector.gender === "FEMALE" ? "usersFemale" : "usersOther");
    if (key === "language") return collector.language === "ur" ? "اردو" : "English";
    return key === "commission" && value !== "" ? `${value}%` : value || "—";
  }
  return <AppShell account={account} headerTitle="people" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className="page-header"><div><h1 className="page-title">{t("people")}</h1><p className="page-subtitle">{t("peopleDescription")}</p></div>
      <Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={18} aria-hidden="true" />{t("peopleAdd")}</Button></div>
    {notice && <p className="form-message users-notice" role="status">{t(notice)}</p>}
    <div className="people-tabs"><Button variant={tab === "collectors" ? "default" : "outline"} aria-pressed={tab === "collectors"} onClick={() => setTab("collectors")}>{t("peopleCollectors")}</Button>
      <Button variant={tab === "requests" ? "default" : "outline"} aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>{t("peopleRequests")}</Button></div>
    {tab === "requests" ? <CollectorRequests accountId={account.id} admin={admin} onChanged={invalidate} /> : <>
      <Card className="users-filter-bar people-filters"><span className="users-filter-label">{t("usersFilters")}</span>
        <div className="users-filter-controls"><label className="users-filter-search"><Search size={17} aria-hidden="true" />
          <Input type="search" aria-label={t("peopleSearch")} placeholder={t("peopleSearch")} value={search} maxLength={100}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <Input type="search" className="people-area-filter" aria-label={t("peopleArea")} placeholder={t("peopleArea")} value={area} maxLength={100}
            onChange={(event) => { setArea(event.target.value); setPage(1); }} />
          <select className="input users-filter-role" aria-label={t("status")} value={status} onChange={(event) => {
            const value = event.target.value;
            if (value === "ALL" || value === "ACTIVE" || value === "INACTIVE" || value === "BLOCKED") { setStatus(value); setPage(1); }
          }}><option value="ALL">{t("peopleAllStatuses")}</option><option value="ACTIVE">{t("usersActive")}</option>
            <option value="INACTIVE">{t("usersInactive")}</option><option value="BLOCKED">{t("usersBlocked")}</option></select>
          <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")} onClick={invalidate}><RefreshCw size={17} /></Button>
        </div></Card>
      <div className="users-results-heading"><span>{t("peopleCollectors")}{data && <strong>{data.total}</strong>}</span>
        <span className="muted" role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
      {query.error != null && <p className="form-message auth-error" role="alert">{t(peopleError(query.error))}</p>}
      <section className="users-card-grid" aria-label={t("peopleCollectors")} aria-busy={loading}>
        {data?.collectors.map((collector) => <CollectorCard key={collector.id} collector={collector} admin={admin} onView={view} onEdit={edit} />)}
        {!data && loading && Array.from({ length: 6 }, (_, index) => <Card key={index} className="users-card-skeleton" aria-hidden="true"><span /><span /><span /></Card>)}
      </section>
      {!loading && data?.collectors.length === 0 && <Card className="users-empty">{t("peopleEmpty")}</Card>}
      {data && <div className="users-pagination"><span className="muted">{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
        <div className="header-actions"><Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
          <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    </>}
    <Dialog open={open} busy={busy} onOpenChange={(value) => { if (!value) setOpen(false); }} className="users-editor-dialog"
      title={t(editing ? admin ? "usersEdit" : "peopleRequestEdit" : "peopleAdd")} description={t("peopleNoLogin")}>
      {open && <CollectorForm collector={editing} admin={admin} onBusyChange={setBusy} onSaved={saved} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }} className="users-editor-dialog"
      title={t("peopleProfile")} description={t("peopleNoLogin")}>
      {viewing && <div className="users-profile-details"><span className="user-card-avatar"><UserRound size={36} />
        {viewing.hasPhoto && <img alt={viewing.fullName} src={photoUrl(viewing)} />}</span>
        <h3>{viewing.fullName}</h3><p className="muted" dir="ltr">{viewing.code}</p>
        <dl>{(Object.keys(collectorLabels) as (keyof CollectorValues)[]).map((key) => <div key={key}>
          <dt>{t(collectorLabels[key])}</dt><dd dir={key === "phone" || key === "email" || key === "whatsapp" || key === "pin" ? "ltr" : undefined}>{profileValue(key, viewing)}</dd></div>)}</dl>
        <div className="people-book-placeholder"><h3>{t("peopleBookHistory")}</h3><p className="muted">{t("peopleBooksLater")}</p>
          <Button variant="outline" disabled title={t("peopleBooksLater")}>{t("peopleAssignBooks")}</Button></div>
        <Button variant="outline" onClick={() => edit(viewing)}>{t(admin ? "usersEdit" : "peopleRequestEdit")}</Button>
      </div>}
    </Dialog>
  </AppShell>;
}
