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
import { editionLabel } from "@/modules/masters/editions.schema";
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
  return <tr><td><div className={"masters-name-stack flex flex-col items-start gap-[6px] [&_>_*]:max-w-[100%] [&_.masters-secondary]:mt-0 [&_[lang='ur']]:[font-family:var(--font-urdu),_serif] [&_[lang='ur']]:leading-[1.9]"}><strong className={"masters-record-name font-[550] block leading-[1.6]"} lang={language}>
    {language === "ur" ? row.nameUr : row.nameEn}</strong>
    <span className={"masters-secondary block mt-[5px] text-[length:11px] text-[color:var(--muted-foreground)]"} lang={language === "ur" ? "en" : "ur"} dir={language === "ur" ? "ltr" : "rtl"}>
      {language === "ur" ? row.nameEn : row.nameUr}</span></div></td>
    <td><bdi dir="ltr">{row.code}</bdi></td>
    <td>{row.kind === "TOKEN_VALUE" ? `₹${row.tokenValue}` : row.kind === "EDITION" ? row.edition ? `${row.edition.printingYear} · ${row.edition.quantity} ${t("books")}` : "—"
      : row.kind === "BANK_ACCOUNT" ? `${parent} · •••• ${row.lastFour}`
      : row.kind === "DONATION_HEAD" ? <>{parent}{row.needsDetail && <span className={"masters-secondary block mt-[5px] text-[length:11px] text-[color:var(--muted-foreground)]"}>{t("mastersNeedsDetail")}</span>}</>
      : row.kind === "AREA" && row.level ? <>{t(masterLevelLabels[row.level])}{parent && <span className={"masters-secondary block mt-[5px] text-[length:11px] text-[color:var(--muted-foreground)]"}>{parent}</span>}</>
      : row.needsDetail ? t("mastersNeedsDetail") : "—"}</td>
    <td><Badge tone={row.active ? "success" : "neutral"}>{t(row.active ? "usersActive" : "usersInactive")}</Badge></td>
    <td><div className={"masters-row-actions flex items-center justify-center gap-[4px] [&_.button-icon]:w-[30px] [&_.button-icon]:h-[30px] [&_.button-icon]:min-w-[30px] [&_.button-icon]:p-0"}><Button variant="ghost" size="icon" aria-label={t("usersView")} title={t("usersView")} onClick={() => onView(row)}><Eye size={17} /></Button>
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
  const key = `${scope}query:${kind}:${kind === "DONATION_HEAD" ? "grouped:" : ""}${params}`;
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
    if (kind === "EDITION") {
      cache.invalidate(`${accountId}:books:query:`);
      cache.invalidate(`${accountId}:books:entry-context:`);
      cache.invalidate(`${accountId}:assignments:stock:`);
    }
    if (kind === "DONATION_CATEGORY" || kind === "DONATION_HEAD") cache.invalidate(`${scope}receipt-donations`);
    if (kind === "AREA") cache.invalidate(`${accountId}:leftovers:options:`);
    if (kind === "BANK") cache.invalidate(`${scope}query:BANK_ACCOUNT:`);
    if (kind === "DONATION_CATEGORY") cache.invalidate(`${scope}query:DONATION_HEAD:`);
    setOpen(false); setBusy(false); setNotice(true);
  }
  return <section className={"masters-category min-w-0"} aria-label={category ? t(category.label) : t("masters")}>
    <div className={"masters-category-header flex justify-between items-center gap-[12px] min-h-[36px] [&_h2]:text-[length:18px]"}><h2>{category && t(category.label)}</h2>
      {!fixedMasterKinds.includes(kind) && <Button size="small" onClick={() => { setEditing(undefined); setOpen(true); }}><Plus size={16} />{t("mastersAdd")}</Button>}</div>
    <p className={"masters-category-hint text-[color:var(--muted-foreground)] text-[length:11px] leading-[1.8] my-[10px_20px]"}>{t(kind === "DONATION_CATEGORY" ? "mastersDonationCategoriesHint"
      : fixedMasterKinds.includes(kind) ? "mastersFixedHint" : "mastersInactiveHint")}</p>
    {notice && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] masters-notice mb-[18px]"} role="status">{t("mastersSaved")}</p>}
    <Card className={"masters-filter-bar flex items-center gap-[10px] p-[14px] max-[1100px]:flex-wrap"}><label className={"masters-search relative flex-1 [&_>_svg]:absolute [&_>_svg]:start-[13px] [&_>_svg]:top-[15px] [&_>_svg]:text-[color:var(--muted-foreground)] [&_.input]:ps-[39px]"}><Search size={17} aria-hidden="true" />
      <Input type="search" maxLength={100} value={search} placeholder={t("mastersSearch")} aria-label={t("mastersSearch")}
        onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      {kind === "AREA" && <select className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)] masters-filter max-w-[155px]"} aria-label={t("mastersAreaLevel")} value={level} onChange={(event) => {
        const value = event.target.value;
        if (value === "" || value === "STATE" || value === "DISTRICT" || value === "BLOCK" || value === "VILLAGE") { setLevel(value); setPage(1); }
      }}><option value="">{t("mastersAllLevels")}</option>{(Object.keys(masterLevelLabels) as Exclude<MasterValues["level"], "">[]).map((value) =>
        <option key={value} value={value}>{t(masterLevelLabels[value])}</option>)}</select>}
      <select className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)] masters-filter max-w-[155px]"} aria-label={t("status")} value={status} onChange={(event) => {
        const value = event.target.value;
        if (value === "ALL" || value === "ACTIVE" || value === "INACTIVE") { setStatus(value); setPage(1); }
      }}><option value="ALL">{t("peopleAllStatuses")}</option><option value="ACTIVE">{t("usersActive")}</option><option value="INACTIVE">{t("usersInactive")}</option></select>
      <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")} onClick={() => cache.invalidate(`${scope}query:${kind}:`)}><RefreshCw size={17} /></Button>
    </Card>
    <div className={"masters-results flex justify-between items-center gap-[14px] text-[length:12px] my-[20px_13px] min-h-[20px]"}><span>{t("mastersRecords")} {data?.total ?? "—"}</span><span className={"muted text-[color:var(--muted-foreground)]"} role="status">{loading && t(data ? "usersUpdating" : "working")}</span></div>
    {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(mastersError(query.error))}</p>}
    <Card className={"masters-table-card overflow-hidden [&_.table-container]:mt-0 [&_.masters-table_:is(th,_td)]:p-[16px] [&_.masters-table_:is(th,_td)]:text-start [&_.masters-table_:is(th,_td)]:align-middle [&_.masters-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_.masters-table_:is(th,_td):first-child]:ps-[20px] [&_.masters-table_:is(th,_td):last-child]:pe-[20px] [&_.masters-table_thead_th]:bg-[var(--muted)] [&_.masters-table_thead_th]:text-[length:11px] [&_.masters-table_thead_th]:font-semibold [&_.masters-table_thead_th]:[border-bottom:1px_solid_var(--border)] [&_.masters-table_tbody_td]:text-[length:12px] [&_.masters-table_tbody_td]:leading-[1.6] [&_.masters-table_:is(th,_td):nth-child(4)]:text-center [&_.masters-table_:is(th,_td):nth-child(5)]:text-center"} aria-busy={loading}><div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end masters-table [table-layout:fixed] min-w-[880px] [&_tbody_tr:not(.masters-donation-group):hover]:bg-[var(--background)]"}>
      <colgroup><col className={"masters-col-name w-[38%]"} /><col className={"masters-col-code w-[20%]"} /><col className={"masters-col-details w-[20%]"} />
        <col className={"masters-col-status w-[10%]"} /><col className={"masters-col-actions w-[12%]"} /></colgroup>
      <thead><tr><th scope="col">{t("mastersName")}</th><th scope="col">{t(kind === "EDITION" ? "editionCode" : "mastersCode")}</th><th scope="col">{t("mastersDetails")}</th>
        <th scope="col">{t("status")}</th><th scope="col">{t("usersActions")}</th></tr></thead>
      <tbody>{data?.rows.map((row, index) => <Fragment key={row.id}>
        {kind === "DONATION_HEAD" && (index === 0 || data.rows[index - 1]?.parentId !== row.parentId)
          && <tr className={"masters-donation-group [&_th]:bg-[var(--accent)] [&_th]:text-[color:var(--primary)] [&_th]:py-[15px] [&_th]:font-[650]"}><th colSpan={5}>{(language === "ur" ? row.parentNameUr : row.parentNameEn) || t("mastersPreviousHeads")}</th></tr>}
        <MasterTableRow row={row} onView={view} onEdit={edit} /></Fragment>)}
        {!data && loading && <tr><td colSpan={5}>{t("working")}</td></tr>}
        {!loading && data?.rows.length === 0 && <tr><td colSpan={5}>{t("mastersEmpty")}</td></tr>}</tbody>
    </table></div></Card>
    {data && <div className={"masters-pagination flex justify-between items-center gap-[14px] text-[length:12px] mt-[20px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
      <div className={"header-actions flex items-center gap-[12px]"}><Button variant="outline" size="small" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}
    <Dialog open={open} busy={busy} onOpenChange={(value) => { if (!value) setOpen(false); }} title={t(editing ? "mastersEdit" : "mastersAdd")}
      description={t(kind === "EDITION" ? "editionFormHelp" : "mastersFormHelp")} className={"masters-editor-dialog w-[min(760px,_calc(100vw_-_40px))]"}>
      {open && <MasterForm accountId={accountId} kind={kind} record={editing} onBusyChange={setBusy} onSaved={saved} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }} title={t("mastersDetails")}
      description={t("mastersInactiveHint")} className={"masters-view-dialog w-[min(600px,_calc(100vw_-_40px))]"}>
      {viewing && <div className={"masters-view grid gap-[20px] pt-[24px] [&_dl]:m-0 [&_dl_>_div]:grid [&_dl_>_div]:grid-cols-[155px_minmax(0,_1fr)] [&_dl_>_div]:gap-[15px] [&_dl_>_div]:py-[13px] [&_dl_>_div]:[border-bottom:1px_solid_var(--border)] [&_dt]:text-[length:12px] [&_dt]:text-[color:var(--muted-foreground)] [&_dd]:m-0 [&_dd]:text-[length:12px] [&_dd]:whitespace-pre-wrap [&_dd]:[overflow-wrap:anywhere]"}><h3>{language === "ur" ? viewing.nameUr : viewing.nameEn}</h3>
        <dl>{((viewing.kind === "EDITION" ? [
          ["editionNumber", viewing.edition ? editionLabel(Number(viewing.edition.editionNumber)) : viewing.nameEn],
          ["editionCode", viewing.edition?.editionCode ?? viewing.code],
          ["editionBookType", viewing.edition ? t(viewing.edition.bookType === "TOKEN" ? "editionToken" : "editionGeneral") : ""],
          ["editionPrintingYear", viewing.edition?.printingYear ?? ""],
          ["editionTokenDistribution", viewing.edition?.bookType === "TOKEN" ? `₹10: ${viewing.edition.tokenTen} · ₹20: ${viewing.edition.tokenTwenty} · ₹50: ${viewing.edition.tokenFifty}` : ""],
          ["editionPagesFrom", viewing.edition?.pagesFrom ?? ""], ["editionPagesTo", viewing.edition?.pagesTo ?? ""],
          ["editionPagesPerBook", "50"], ["editionQuantity", viewing.edition ? String(viewing.edition.quantity) : ""],
          ["editionPrinter", viewing.edition?.designedPrintedBy ?? ""],
          ["status", t(viewing.active ? "usersActive" : "usersInactive")],
        ] : [["mastersCode", viewing.code], ["mastersNameEn", viewing.nameEn], ["mastersNameUr", viewing.nameUr],
          ["status", t(viewing.active ? "usersActive" : "usersInactive")],
          ["mastersAreaLevel", viewing.level ? t(masterLevelLabels[viewing.level]) : ""],
          [viewing.kind === "DONATION_HEAD" ? "mastersDonationCategory" : "mastersParent", language === "ur" ? viewing.parentNameUr : viewing.parentNameEn],
          ["mastersTokenRupees", viewing.tokenValue], ["mastersAccountName", viewing.accountName],
          ["mastersLastFour", viewing.lastFour], ["mastersUpiId", viewing.upiId],
          ["mastersNeedsDetail", viewing.needsDetail ? t("mastersRequired") : ""], ["usersRemarks", viewing.notes]]) as [MessageKey, string][])
          .filter(([, value]) => value !== "").map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
        <Button variant="outline" onClick={() => edit(viewing)}>{t("mastersEdit")}</Button></div>}
    </Dialog>
  </section>;
}

export function MastersScreen({ account, editionOnly = false }: { account: Account; editionOnly?: boolean }) {
  const { t } = useLanguage();
  const [selectedKind, setKind] = usePageState<MasterKind>(`${account.id}:masters:category`, "BOOK_TYPE");
  const kind = selectedKind === "EDITION" ? "BOOK_TYPE" : selectedKind === "DONATION_CATEGORY" ? "DONATION_HEAD" : selectedKind;
  if (editionOnly) return <AppShell account={account} headerTitle="mastersEditions" sampleData={false} search="" onSearchChange={() => {}}>
    <div className="mb-[22px]"><h1 className="text-[34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-normal">{t("mastersEditions")}</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">{t("editionFormHelp")}</p></div>
    <MasterCategory key="EDITION" accountId={account.id} kind="EDITION" />
  </AppShell>;
  return <AppShell account={account} headerTitle="masters" sampleData={false} search="" onSearchChange={() => {}}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("masters")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("mastersDescription")}</p></div></div>
    <div className={"masters-layout grid grid-cols-[195px_minmax(0,_1fr)] gap-[24px] items-start max-[1100px]:grid-cols-[165px_minmax(0,_1fr)] max-[1100px]:gap-[16px] max-[700px]:grid-cols-[1fr]"}><nav className={"masters-categories grid gap-[5px] p-[10px] bg-[var(--card)] [border:1px_solid_var(--border)] rounded-[var(--radius)] max-[700px]:grid-cols-[repeat(2,_minmax(0,_1fr))]"} aria-label={t("mastersCategories")}>
      {masterCategories.filter((category) => category.kind !== "EDITION").map((category) => <button key={category.kind} type="button" className={"masters-category-button [border:0] bg-[transparent] text-[color:var(--muted-foreground)] [font:inherit] text-[length:12px] text-start p-[13px_12px] rounded-[var(--radius-control)] cursor-pointer [&:hover]:bg-[var(--muted)] [&[aria-current='true']]:bg-[var(--accent)] [&[aria-current='true']]:text-[color:var(--primary)] [&[aria-current='true']]:font-semibold"}
        aria-current={kind === category.kind ? "true" : undefined} onClick={() => setKind(category.kind)}>{t(category.label)}</button>)}
    </nav><MasterCategory key={kind} accountId={account.id} kind={kind} /></div>
  </AppShell>;
}
