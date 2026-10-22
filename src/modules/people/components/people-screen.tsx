"use client";
import Link from "next/link";
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
import { collectorEligibilityResponseSchema, collectorsResponseSchema } from "@/modules/people/people.schema";
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
  return <div className="mt-3 w-full rounded-xl border border-border bg-muted/40 p-3">
    <label className="flex items-center gap-2.5 text-xs font-medium" title={t("peopleLeftoverHelp")}>
      <input type="checkbox" role="switch" className="size-4 shrink-0 accent-primary disabled:cursor-not-allowed" checked={collector.leftoverEligible}
        disabled={!admin || saving} aria-busy={saving || undefined} onChange={() => { void toggle(); }} />
      <span className="flex-1">{t("peopleLeftoverEligible")}</span>
      {saving && <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" role="status" aria-label={t("usersSaving")} />}
    </label>
    {error && <p className="mt-2 text-[11px] text-[var(--danger)]" role="alert">{t(error)}</p>}
  </div>;
}

const CollectorCard = memo(function CollectorCard({ collector, admin, onView, onEdit, onEligibilityChange }: {
  collector: CollectorRow; admin: boolean; onView: (collector: CollectorRow) => void; onEdit: (collector: CollectorRow) => void;
  onEligibilityChange: (collector: CollectorRow) => Promise<void>;
}) {
  const { t } = useLanguage();
  return <Card className={"user-profile-card overflow-hidden flex flex-col"}><div className={"user-card-cover h-[82px] p-[14px_16px] flex items-start justify-between [background:linear-gradient(125deg,_var(--primary-soft),_var(--accent))]"}>
    <Badge tone={collector.status === "ACTIVE" ? "success" : collector.status === "BLOCKED" ? "danger" : "neutral"}>{t(statusLabel(collector.status))}</Badge>
    <span className={"user-card-self text-[color:var(--primary)] text-[length:11px] p-[4px]"} dir="ltr">{collector.code}</span></div>
    <div className={"user-card-body flex flex-1 flex-col items-center p-[0_20px_20px] [&_h3]:mt-[12px] [&_h3]:text-[length:16px] [&_h3]:font-[650] [&_h3]:text-center [&_h3]:[overflow-wrap:anywhere]"}><span className={"user-card-avatar relative inline-flex items-center justify-center w-[88px] h-[88px] mt-[-43px] shrink-0 [border:5px_solid_var(--card)] rounded-[50%] bg-[var(--accent)] text-[color:var(--primary)] overflow-hidden [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover"} aria-hidden="true"><UserRound size={35} />
      {collector.hasPhoto && <img alt="" loading="lazy" decoding="async" src={photoUrl(collector)} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
      <h3>{collector.fullName}</h3><span className={"user-card-role inline-flex items-center gap-[5px] mt-[7px] text-[color:var(--primary)] text-[length:11px]"}>{t("peopleCollector")}</span>
      <CollectorEligibility collector={collector} admin={admin} onChange={onEligibilityChange} />
      <div className={"user-card-contact w-full py-[19px] mt-[16px] [border-block:1px_solid_var(--border)] [&_p]:flex [&_p]:items-center [&_p]:gap-[9px] [&_p]:text-[length:12px] [&_p]:text-[color:var(--muted-foreground)] [&_p_+_p]:mt-[12px] [&_svg]:shrink-0 [&_p_span]:min-w-0 [&_p_span]:overflow-hidden [&_p_span]:text-ellipsis [&_p_span]:whitespace-nowrap"}><p><span dir="ltr">{collector.phone}</span></p>
        <p><MapPin size={15} aria-hidden="true" /><span>{collector.village}, {collector.district}</span></p>
        {collector.email && <p><Mail size={15} aria-hidden="true" /><span dir="ltr">{collector.email}</span></p>}</div>
      <div className={"user-card-actions flex items-center w-full gap-[6px] pt-[17px] mt-auto [&_.button-small]:flex-1 [&_.button-small]:min-w-0 [&_.button-small]:gap-[5px] [&_.button-small]:px-[7px] [&_.button-icon]:w-[34px] [&_.button-icon]:h-[34px] [&_.button-icon]:p-[6px] [&_.button-icon]:shrink-0"}><Button variant="outline" size="small" onClick={() => onView(collector)}><Eye size={15} />{t("usersView")}</Button>
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
    cache.invalidate(`${scope}eligible:query:`);
    cache.invalidate(`${account.id}:leftovers:options:`);
    setViewing((previous) => previous?.id === updated.id ? updated : previous);
    setNotice("peopleEligibilitySaved");
  }, [admin, cache, scope, account.id]);

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
    if (!editing && !requested) setViewing(collector);
  }

  function profileValue(key: keyof CollectorValues, collector: CollectorRow) {
    const value = collector[key];
    if (key === "status") return t(statusLabel(collector.status));
    if (key === "gender") return t(collector.gender === "MALE" ? "usersMale" : collector.gender === "FEMALE" ? "usersFemale" : "usersOther");
    if (key === "language") return collector.language === "ur" ? "اردو" : "English";
    return key === "commission" && value !== "" ? `${value}%` : value || "—";
  }
  return <AppShell account={account} headerTitle="people" sampleData={false} search={search} onSearchChange={setSearch}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("people")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("peopleDescription")}</p></div>
      <Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={18} aria-hidden="true" />{t("peopleAdd")}</Button></div>
    {notice && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] users-notice mb-[var(--space-gap)]"} role="status">{t(notice)}</p>}
    <div className={"people-tabs flex gap-[10px] mb-[22px]"}><Button variant={tab === "collectors" ? "default" : "outline"} aria-pressed={tab === "collectors"} onClick={() => setTab("collectors")}>{t("peopleCollectors")}</Button>
      <Button variant={tab === "requests" ? "default" : "outline"} aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>{t("peopleRequests")}</Button></div>
    {tab === "requests" ? <CollectorRequests accountId={account.id} admin={admin} onChanged={invalidate} /> : <>
      <Card className={"users-filter-bar flex items-center justify-between gap-[20px] p-[16px_20px] people-filters max-[1200px]:items-start max-[1200px]:[&_.users-filter-controls]:flex-wrap"}><span className={"users-filter-label inline-flex items-center gap-[9px] font-semibold [&_svg]:text-[color:var(--primary)]"}>{t("usersFilters")}</span>
        <div className={"users-filter-controls flex items-center justify-end gap-[10px] flex-1"}><label className={"users-filter-search relative w-[min(100%,_370px)] [&_>_svg]:absolute [&_>_svg]:start-[13px] [&_>_svg]:top-[15px] [&_>_svg]:text-[color:var(--muted-foreground)] [&_.input]:ps-[39px]"}><Search size={17} aria-hidden="true" />
          <Input type="search" aria-label={t("peopleSearch")} placeholder={t("peopleSearch")} value={search} maxLength={100}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <Input type="search" className={"people-area-filter max-w-[190px]"} aria-label={t("peopleArea")} placeholder={t("peopleArea")} value={area} maxLength={100}
            onChange={(event) => { setArea(event.target.value); setPage(1); }} />
          <select className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)] users-filter-role w-[165px]"} aria-label={t("status")} value={status} onChange={(event) => {
            const value = event.target.value;
            if (value === "ALL" || value === "ACTIVE" || value === "INACTIVE" || value === "BLOCKED") { setStatus(value); setPage(1); }
          }}><option value="ALL">{t("peopleAllStatuses")}</option><option value="ACTIVE">{t("usersActive")}</option>
            <option value="INACTIVE">{t("usersInactive")}</option><option value="BLOCKED">{t("usersBlocked")}</option></select>
          <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")} onClick={invalidate}><RefreshCw size={17} /></Button>
        </div></Card>
      <div className={"users-results-heading flex items-center justify-between gap-[15px] my-[24px_17px] text-[length:12px] min-h-[24px] [&_>_span:first-child]:flex [&_>_span:first-child]:items-center [&_>_span:first-child]:gap-[9px] [&_>_span:first-child]:font-semibold [&_strong]:p-[3px_9px] [&_strong]:bg-[var(--accent)] [&_strong]:text-[color:var(--primary)] [&_strong]:rounded-[var(--radius-pill)]"}><span>{t("peopleCollectors")}{data && <strong>{data.total}</strong>}</span>
        <span className={"muted text-[color:var(--muted-foreground)]"} role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
      {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(peopleError(query.error))}</p>}
      <section className={"users-card-grid grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-[var(--space-gap)] min-[1800px]:grid-cols-[repeat(4,_minmax(0,_1fr))] max-[1000px]:grid-cols-[repeat(2,_minmax(0,_1fr))]"} aria-label={t("peopleCollectors")} aria-busy={loading}>
        {data?.collectors.map((collector) => <CollectorCard key={collector.id} collector={collector} admin={admin} onView={view} onEdit={edit} onEligibilityChange={changeEligibility} />)}
        {!data && loading && Array.from({ length: 6 }, (_, index) => <Card key={index} className={"users-card-skeleton min-h-[330px] overflow-hidden pb-[24px] [&_span]:block [&_span]:bg-[var(--muted)] [&_span]:[animation:users-pulse_1.4s_ease-in-out_infinite] [&_span:first-child]:h-[82px] [&_span:first-child]:bg-[var(--accent)] [&_span:nth-child(2)]:h-[84px] [&_span:nth-child(2)]:w-[84px] [&_span:nth-child(2)]:rounded-[50%] [&_span:nth-child(2)]:m-[-40px_auto_30px] [&_span:nth-child(2)]:[border:5px_solid_var(--card)] [&_span:nth-child(2)]:relative [&_span:last-child]:h-[12px] [&_span:last-child]:w-[65%] [&_span:last-child]:rounded-[var(--radius-control)] [&_span:last-child]:m-auto"} aria-hidden="true"><span /><span /><span /></Card>)}
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
        <dl>{(Object.keys(collectorLabels) as (keyof CollectorValues)[]).map((key) => <div key={key}>
          <dt>{t(collectorLabels[key])}</dt><dd dir={key === "phone" || key === "email" || key === "whatsapp" || key === "pin" ? "ltr" : undefined}>{profileValue(key, viewing)}</dd></div>)}</dl>
        <div className={"people-book-placeholder w-full p-[20px] bg-[var(--muted)] rounded-[var(--radius)] grid gap-[12px] [&_.muted]:text-[length:12px] [&_.muted]:leading-[1.8] [&_.button]:[justify-self:start]"}><h3>{t("peopleAssignBooks")}</h3><p className={"muted text-[color:var(--muted-foreground)]"}>{t("assignProfileHelp")}</p>
          {viewing.status === "ACTIVE" && <Button asChild variant="outline"><Link href={`/books/assignments?fundraiser=${viewing.id}&code=${encodeURIComponent(viewing.code)}`}>{t("peopleAssignBooks")}</Link></Button>}</div>
        <Button variant="outline" onClick={() => edit(viewing)}>{t(admin ? "usersEdit" : "peopleRequestEdit")}</Button>
      </div>}
    </Dialog>
  </AppShell>;
}
