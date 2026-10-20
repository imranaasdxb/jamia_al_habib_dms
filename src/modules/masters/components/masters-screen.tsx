"use client";
import { Fragment, memo, useCallback, useState } from "react";
import { Eye, PencilLine, Plus, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MasterForm } from "@/modules/masters/components/master-form";
import { masterCategories, masterLevelLabels, mastersError, mastersRequest } from "@/modules/masters/masters.client";
import { fixedMasterKinds, mastersResponseSchema } from "@/modules/masters/masters.schema";
import type { MasterKind, MasterPage, MasterQuery, MasterRow, MasterValues } from "@/modules/masters/masters.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { MessageKey } from "@/lib/i18n/messages";

function reconcile(previous: MasterPage | undefined, next: MasterPage): MasterPage {
  const existing = new Map(previous?.rows.map((row) => [row.id, row]));
  return { ...next, rows: next.rows.map((row) => {
    const cached = existing.get(row.id);
    return cached && JSON.stringify(cached) === JSON.stringify(row) ? cached : row;
  }) };
}
const MasterTableRow = memo(function MasterTableRow({ row, onEdit, onView }: {
  row: MasterRow; onEdit: (row: MasterRow) => void; onView: (row: MasterRow) => void;
}) {
  const { t, language } = useLanguage();
  const parent = language === "ur" ? row.parentNameUr : row.parentNameEn;
  return <tr><td><div className="masters-name-stack"><strong className="masters-record-name" lang={language}>
    {language === "ur" ? row.nameUr : row.nameEn}</strong>
    <span className="masters-secondary" lang={language === "ur" ? "en" : "ur"} dir={language === "ur" ? "ltr" : "rtl"}>
      {language === "ur" ? row.nameEn : row.nameUr}</span></div></td>
    <td><bdi dir="ltr">{row.code}</bdi></td>
    <td>{row.kind === "TOKEN_VALUE" ? `₹${row.tokenValue}` : row.kind === "EDITION" ? row.effectiveFrom
      : row.kind === "BANK_ACCOUNT" ? `${parent} · •••• ${row.lastFour}`
      : row.kind === "DONATION_HEAD" ? <>{parent}{row.needsDetail && <span className="masters-secondary">{t("mastersNeedsDetail")}</span>}</>
      : row.kind === "AREA" && row.level ? <>{t(masterLevelLabels[row.level])}{parent && <span className="masters-secondary">{parent}</span>}</>
      : row.needsDetail ? t("mastersNeedsDetail") : "—"}</td>
    <td><Badge tone={row.active ? "success" : "neutral"}>{t(row.active ? "usersActive" : "usersInactive")}</Badge></td>
    <td><div className="masters-row-actions"><Button variant="ghost" size="icon" aria-label={t("usersView")} title={t("usersView")} onClick={() => onView(row)}><Eye size={17} /></Button>
      <Button variant="ghost" size="icon" aria-label={t("mastersEdit")} title={t("mastersEdit")} onClick={() => onEdit(row)}><PencilLine size={17} /></Button></div></td>
  </tr>;
});

function MasterCategory({ kind, accountId }: { kind: MasterKind; accountId: string }) {
  const { t, language } = useLanguage();
  const cache = usePageDataCache();
  const scope = `${accountId}:masters:`;
  const [search, setSearch] = usePageState(`${scope}${kind}:search`, "");
  const [status, setStatus] = usePageState<MasterQuery["status"]>(`${scope}${kind}:status${kind === "DONATION_HEAD" ? ":grouped" : ""}`,
    kind === "DONATION_HEAD" ? "ACTIVE" : "ALL");
  const [level, setLevel] = usePageState<MasterValues["level"]>(`${scope}${kind}:level`, "");
  const [page, setPage] = usePageState(`${scope}${kind}:page`, 1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRow | undefined>();
  const [viewing, setViewing] = useState<MasterRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const params = new URLSearchParams({ kind, search: search.trim(), status, level: kind === "AREA" ? level : "", page: String(page) }).toString();
  const key = `${scope}query:${kind}:${params}`;
  const fetchRows = useCallback(async (): Promise<MasterPage> => {
    const result = mastersResponseSchema.parse(await mastersRequest(`/api/v1/masters?${params}`));
    return { rows: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(key, fetchRows, { enabled: !open, delay: search ? 300 : 0, reconcile });
  const data = query.data;
  const loading = query.loading || query.stale;
  const category = masterCategories.find((item) => item.kind === kind);
  const edit = useCallback((row: MasterRow) => { setViewing(null); setEditing(row); setOpen(true); }, []);
  const view = useCallback((row: MasterRow) => setViewing(row), []);
  function saved(row: MasterRow) {
    if (data) {
      const term = search.trim().toLowerCase();
      const matches = (status === "ALL" || row.active === (status === "ACTIVE"))
        && (kind !== "AREA" || !level || row.level === level)
        && [row.code, row.nameEn, row.nameUr].some((value) => value.toLowerCase().includes(term));
      const exists = data.rows.some((item) => item.id === row.id);
      const added = !editing && !exists && matches && data.page === 1;
      const removed = exists && !matches;
      const rows = exists ? data.rows.flatMap((item) => item.id !== row.id ? [item] : matches ? [row] : [])
        : added ? [row, ...data.rows].slice(0, data.pageSize) : data.rows;
      cache.setQueryData(key, { ...data, rows, total: data.total + (added ? 1 : removed ? -1 : 0) });
    }
    cache.invalidate(`${scope}query:${kind}:`);
    cache.invalidate(`${scope}options:${kind}:`);
    if (kind === "BANK") cache.invalidate(`${scope}query:BANK_ACCOUNT:`);
    if (kind === "DONATION_CATEGORY") cache.invalidate(`${scope}query:DONATION_HEAD:`);
    setOpen(false); setBusy(false); setNotice(true);
  }
  return <section className="masters-category" aria-label={category ? t(category.label) : t("masters")}>
    <div className="masters-category-header"><h2>{category && t(category.label)}</h2>
      {!fixedMasterKinds.includes(kind) && <Button size="small" onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={16} />{t("mastersAdd")}</Button>}</div>
    <p className="masters-category-hint">{t(kind === "DONATION_CATEGORY" ? "mastersDonationCategoriesHint"
      : fixedMasterKinds.includes(kind) ? "mastersFixedHint" : "mastersInactiveHint")}</p>
    {notice && <p className="form-message masters-notice" role="status">{t("mastersSaved")}</p>}
    <Card className="masters-filter-bar"><label className="masters-search"><Search size={17} aria-hidden="true" />
      <Input type="search" maxLength={100} value={search} placeholder={t("mastersSearch")} aria-label={t("mastersSearch")}
        onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      {kind === "AREA" && <select className="input masters-filter" aria-label={t("mastersAreaLevel")} value={level} onChange={(event) => {
        const value = event.target.value;
        if (value === "" || value === "STATE" || value === "DISTRICT" || value === "BLOCK" || value === "VILLAGE") { setLevel(value); setPage(1); }
      }}><option value="">{t("mastersAllLevels")}</option>{(Object.keys(masterLevelLabels) as Exclude<MasterValues["level"], "">[]).map((value) =>
        <option key={value} value={value}>{t(masterLevelLabels[value])}</option>)}</select>}
      <select className="input masters-filter" aria-label={t("status")} value={status} onChange={(event) => {
        const value = event.target.value;
        if (value === "ALL" || value === "ACTIVE" || value === "INACTIVE") { setStatus(value); setPage(1); }
      }}><option value="ALL">{t("peopleAllStatuses")}</option><option value="ACTIVE">{t("usersActive")}</option><option value="INACTIVE">{t("usersInactive")}</option></select>
      <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")} onClick={() => cache.invalidate(`${scope}query:${kind}:`)}><RefreshCw size={17} /></Button>
    </Card>
    <div className="masters-results"><span>{t("mastersRecords")} {data?.total ?? "—"}</span><span className="muted" role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
    {query.error != null && <p className="form-message auth-error" role="alert">{t(mastersError(query.error))}</p>}
    <Card className="masters-table-card" aria-busy={loading}><div className="table-container"><table className="data-table masters-table">
      <colgroup><col className="masters-col-name" /><col className="masters-col-code" /><col className="masters-col-details" />
        <col className="masters-col-status" /><col className="masters-col-actions" /></colgroup>
      <thead><tr><th scope="col">{t("mastersName")}</th><th scope="col">{t("mastersCode")}</th><th scope="col">{t("mastersDetails")}</th>
        <th scope="col">{t("status")}</th><th scope="col">{t("usersActions")}</th></tr></thead>
      <tbody>{data?.rows.map((row, index) => <Fragment key={row.id}>
        {kind === "DONATION_HEAD" && (index === 0 || data.rows[index - 1]?.parentId !== row.parentId)
          && <tr className="masters-donation-group"><th colSpan={5}>{(language === "ur" ? row.parentNameUr : row.parentNameEn) || t("mastersPreviousHeads")}</th></tr>}
        <MasterTableRow row={row} onView={view} onEdit={edit} /></Fragment>)}
        {!data && loading && <tr><td colSpan={5}>{t("working")}</td></tr>}
        {!loading && data?.rows.length === 0 && <tr><td colSpan={5}>{t("mastersEmpty")}</td></tr>}</tbody>
    </table></div></Card>
    {data && <div className="masters-pagination"><span className="muted">{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
      <div className="header-actions"><Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={open} busy={busy} onOpenChange={(value) => { if (!value) setOpen(false); }} title={t(editing ? "mastersEdit" : "mastersAdd")}
      description={t("mastersFormHelp")} className="masters-editor-dialog">
      {open && <MasterForm accountId={accountId} kind={kind} record={editing} onBusyChange={setBusy} onSaved={saved} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }} title={t("mastersDetails")}
      description={t("mastersInactiveHint")} className="masters-view-dialog">
      {viewing && <div className="masters-view"><h3>{language === "ur" ? viewing.nameUr : viewing.nameEn}</h3>
        <dl>{([["mastersCode", viewing.code], ["mastersNameEn", viewing.nameEn], ["mastersNameUr", viewing.nameUr],
          ["status", t(viewing.active ? "usersActive" : "usersInactive")], ["mastersEffective", viewing.effectiveFrom],
          ["mastersAreaLevel", viewing.level ? t(masterLevelLabels[viewing.level]) : ""],
          [viewing.kind === "DONATION_HEAD" ? "mastersDonationCategory" : "mastersParent", language === "ur" ? viewing.parentNameUr : viewing.parentNameEn],
          ["mastersTokenRupees", viewing.tokenValue], ["mastersAccountName", viewing.accountName],
          ["mastersLastFour", viewing.lastFour], ["mastersUpiId", viewing.upiId],
          ["mastersNeedsDetail", viewing.needsDetail ? t("mastersRequired") : ""], ["usersRemarks", viewing.notes]] as [MessageKey, string][])
          .filter(([, value]) => value !== "").map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
        <Button variant="outline" onClick={() => edit(viewing)}>{t("mastersEdit")}</Button></div>}
    </Dialog>
  </section>;
}

export function MastersScreen({ account }: { account: Account }) {
  const { t } = useLanguage();
  const [kind, setKind] = usePageState<MasterKind>(`${account.id}:masters:category`, "EDITION");
  return <AppShell account={account} headerTitle="masters" sampleData={false} search="" onSearchChange={() => {}}>
    <div className="page-header"><div><h1 className="page-title">{t("masters")}</h1><p className="page-subtitle">{t("mastersDescription")}</p></div></div>
    <div className="masters-layout"><nav className="masters-categories" aria-label={t("mastersCategories")}>
      {masterCategories.map((category) => <button key={category.kind} type="button" className="masters-category-button"
        aria-current={kind === category.kind ? "true" : undefined} onClick={() => setKind(category.kind)}>{t(category.label)}</button>)}
    </nav><MasterCategory key={kind} accountId={account.id} kind={kind} /></div>
  </AppShell>;
}
