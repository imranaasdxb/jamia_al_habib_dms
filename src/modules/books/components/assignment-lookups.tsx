"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { assignmentsResponseSchema } from "@/modules/books/assignments.schema";
import { collectorsResponseSchema } from "@/modules/people/people.schema";
import { mastersResponseSchema } from "@/modules/masters/masters.schema";
import type { CollectorRow } from "@/modules/people/people.schema";

function LookupPages({ page, total, size, loading, onPage }: { page: number; total: number; size: number; loading: boolean; onPage: (page: number) => void }) {
  const { t } = useLanguage();
  return total > size && <div className={"books-lookup-pages flex justify-between"}><Button variant="ghost" size="small" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>{t("usersPrevious")}</Button>
    <Button variant="ghost" size="small" disabled={loading || page * size >= total} onClick={() => onPage(page + 1)}>{t("usersNext")}</Button></div>;
}
export function AssignmentFundraiser({ accountId, value, initialId, initialCode, onChange, excludedIds = [] }: {
  accountId: string; value: CollectorRow | null; initialId: string; initialCode: string; onChange: (row: CollectorRow) => void;
  excludedIds?: string[];
}) {
  const { t } = useLanguage(); const id = useId();
  const [search, setSearch] = useState(initialCode); const [page, setPage] = useState(1);
  const params = new URLSearchParams({ search: search.trim(), area: "", status: "ACTIVE", page: String(page) }).toString();
  const fetchData = useCallback(async () => {
    const result = collectorsResponseSchema.parse(await booksRequest(`/api/v1/people?${params}`));
    return { collectors: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(`${accountId}:people:query:${params}`, fetchData, { delay: search ? 300 : 0 });
  const rows = query.data?.collectors ?? [];
  useEffect(() => {
    const initial = query.data?.collectors.find((row) => row.id === initialId);
    if (initial && !value) onChange(initial);
  }, [query.data, initialId, value, onChange]);
  return <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor={id}>{t("peopleCollectors")} *</label>
    <Input type="search" value={search} maxLength={100} aria-label={t("assignFindFundraiser")} placeholder={t("assignFindFundraiser")}
      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
      onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    <select id={id} className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} required value={value?.id ?? ""} aria-busy={query.loading || query.stale} onChange={(event) => {
      const selected = rows.find((row) => row.id === event.target.value); if (selected && !excludedIds.includes(selected.id)) onChange(selected);
    }}><option value="" disabled>{t("booksChooseOption")}</option>
      {value && !rows.some((row) => row.id === value.id) && <option value={value.id}>{value.fullName} · {value.code}</option>}
      {rows.map((row) => <option key={row.id} value={row.id} disabled={excludedIds.includes(row.id)}>{row.fullName} · {row.code}{excludedIds.includes(row.id) && ` · ${t("leftoversPreviousFundraiser")}`}</option>)}
    </select>
    {query.loading && <span className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"} role="status">{t("working")}</span>}
    {query.error != null && <p className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</p>}
    {query.data && <LookupPages page={query.data.page} total={query.data.total} size={query.data.pageSize} loading={query.loading} onPage={setPage} />}
    {value && <div className={"assignment-fundraiser-summary grid gap-[8px] p-[15px] mt-[12px] bg-[var(--primary-soft)] rounded-[var(--radius)] text-[length:12px] [overflow-wrap:anywhere]"}><strong>{value.fullName}</strong><span dir="ltr">{value.phone} · {value.whatsapp || "—"}</span>
      <span>{[value.village, value.postOffice, value.block, value.district, value.state, value.pin].filter(Boolean).join(", ")}</span>
      <FundraiserWarning accountId={accountId} collectorId={value.id} /></div>}
  </div>;
}
function FundraiserWarning({ accountId, collectorId }: { accountId: string; collectorId: string }) {
  const { t } = useLanguage();
  const params = new URLSearchParams({ search: "", status: "OPEN", collectorId, page: "1" }).toString();
  const fetchData = useCallback(async () => {
    const result = assignmentsResponseSchema.parse(await booksRequest(`/api/v1/book-assignments?${params}`));
    return { rows: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(`${accountId}:assignments:query:${params}`, fetchData);
  return <>{query.loading && !query.data && <span role="status">{t("working")}</span>}
    {query.error != null && <span className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</span>}
    {query.data && query.data.total > 0 && <span className={"assignment-warning text-[color:var(--foreground)] font-semibold [border-inline-start:3px_solid_var(--primary)] ps-[10px]"} role="status">{t("assignHoldingWarning")} {query.data.total}
      {query.data.overdue > 0 && <> · {t("assignOverdue")}: {query.data.overdue}</>}</span>}</>;
}
type Area = { id: string; nameEn: string; nameUr: string };
export function AssignmentAreas({ accountId, value, onChange }: { accountId: string; value: Area[]; onChange: (rows: Area[]) => void }) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const params = new URLSearchParams({ kind: "AREA", level: "", search: search.trim(), page: String(page) }).toString();
  const fetchData = useCallback(async () => mastersResponseSchema.parse(await booksRequest(`/api/v1/masters/options?${params}`)), [params]);
  const query = usePageQuery(`${accountId}:masters:options:AREA:${params}`, fetchData, { delay: search ? 300 : 0 });
  return <fieldset className={"assignment-areas min-w-0 [border:1px_solid_var(--border)] rounded-[var(--radius)] p-[14px] m-0"}><legend className={"field-label block text-[length:12px] font-semibold mb-[8px]"}>{t("assignAreas")} *</legend>
    <Input type="search" value={search} maxLength={100} placeholder={t("mastersParentSearch")} aria-label={t("assignAreas")}
      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
      onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    <div className={"assignment-chips flex flex-wrap gap-[7px] my-[9px]"}>{value.map((row) => <Button key={row.id} variant="outline" size="small" onClick={() => onChange(value.filter((item) => item.id !== row.id))}>
      {language === "ur" ? row.nameUr : row.nameEn} ×</Button>)}</div>
    <div className={"assignment-area-options grid gap-[9px] max-h-[180px] overflow-y-auto text-[length:12px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)] [&_label]:flex [&_label]:gap-[9px] [&_label]:items-center [&_input]:[accent-color:var(--primary)]"}>{query.data?.data.map((row) => <label key={row.id}><input type="checkbox" checked={value.some((item) => item.id === row.id)}
      disabled={value.length >= 50 && !value.some((item) => item.id === row.id)} onChange={(event) => onChange(event.target.checked
        ? [...value, { id: row.id, nameEn: row.nameEn, nameUr: row.nameUr }] : value.filter((item) => item.id !== row.id))} />{language === "ur" ? row.nameUr : row.nameEn}</label>)}</div>
    {query.loading && <span className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"} role="status">{t("working")}</span>}
    {query.error != null && <p className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</p>}
    {query.data && query.data.data.length === 0 && !query.loading && <span className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"}>{t("assignNoAreas")}</span>}
    {query.data && <LookupPages page={query.data.meta.page} total={query.data.meta.total} size={query.data.meta.pageSize} loading={query.loading} onPage={setPage} />}
  </fieldset>;
}
