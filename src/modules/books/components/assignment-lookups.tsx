"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { assignmentsResponseSchema } from "@/modules/books/assignments.schema";
import { collectorAssignmentOptionsSchema } from "@/modules/people/people.schema";
import { masterOptionsResponseSchema } from "@/modules/masters/masters.schema";

function LookupPages({ page, total, size, loading, onPage }: { page: number; total: number; size: number; loading: boolean; onPage: (page: number) => void }) {
  const { t } = useLanguage();
  return total > size && <div className={"books-lookup-pages flex justify-between"}><Button variant="ghost" size="small" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>{t("usersPrevious")}</Button>
    <Button variant="ghost" size="small" disabled={loading || page * size >= total} onClick={() => onPage(page + 1)}>{t("usersNext")}</Button></div>;
}
type FundraiserOption = import("@/modules/people/people.schema").CollectorAssignmentOption;

function FundraiserProfile({ row }: { row: FundraiserOption }) {
  const { t } = useLanguage();
  return <span className="flex min-w-0 flex-1 items-center gap-3">
    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] font-semibold text-[var(--primary)]">
      {row.fullName.slice(0, 1).toUpperCase()}
      {row.hasPhoto && <img alt="" loading="lazy" decoding="async" width={40} height={40}
        className="absolute inset-0 size-full object-cover" src={`/api/v1/people/${row.id}/photo?v=${encodeURIComponent(row.photoVersion)}`}
        onError={(event) => { event.currentTarget.hidden = true; }} />}
    </span>
    <span className="min-w-0 flex-1 text-start">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="truncate text-sm">{row.fullName}</strong>
        <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] text-[var(--primary)]">{t("usersActive")}</span></span>
      <span className="mt-1 block truncate text-[11px] text-[var(--muted-foreground)]">{row.code} · {row.village}</span>
      <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--muted-foreground)]">
        <span>{t("usersAge")}: {row.age}</span><span>{t("peopleCommission")}: {row.commission ? `${row.commission}%` : "—"}</span>
      </span>
    </span>
  </span>;
}

export function AssignmentFundraiser({ accountId, value, initialId, initialCode, onChange, excludedIds = [], leftoverOnly = false }: {
  accountId: string; value: FundraiserOption | null; initialId: string; initialCode: string; onChange: (row: FundraiserOption) => void;
  excludedIds?: string[]; leftoverOnly?: boolean;
}) {
  const { t } = useLanguage(); const id = useId(); const listId = `${id}-list`;
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(initialCode);
  const [debouncedSearch, setDebouncedSearch] = useState(initialCode.trim());
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 450);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector("input")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const params = new URLSearchParams({ view: "ASSIGNMENT", search: debouncedSearch, status: "ACTIVE", page: String(page),
    ...(leftoverOnly ? { leftoverEligible: "YES" } : {}) }).toString();
  const fetchData = useCallback(async () => {
    const result = collectorAssignmentOptionsSchema.parse(await booksRequest(`/api/v1/people?${params}`));
    return { collectors: result.data, ...result.meta };
  }, [params]);
  const query = usePageQuery(`${accountId}:people:${leftoverOnly ? "eligible:" : ""}query:assignment-options:${params}`, fetchData,
    { enabled: open || Boolean(initialId && !value) });
  const loading = search.trim() !== debouncedSearch || query.loading || query.stale;
  const rows = query.data?.collectors ?? [];
  function choose(row: FundraiserOption) {
    if (row.status !== "ACTIVE" || excludedIds.includes(row.id) || (leftoverOnly && !row.leftoverEligible)) return;
    onChange(row); setOpen(false);
    root.current?.querySelector<HTMLButtonElement>("button[data-fundraiser-trigger]")?.focus();
  }
  useEffect(() => {
    const initial = query.data?.collectors.find((row) => row.id === initialId);
    if (initial && !value && !loading && !excludedIds.includes(initial.id) && (!leftoverOnly || initial.leftoverEligible)) onChange(initial);
  }, [query.data, loading, initialId, value, onChange, excludedIds, leftoverOnly]);
  return <div ref={root} className="min-w-0">
    <label className="mb-2 block text-xs font-semibold" htmlFor={id}>{t("peopleCollectors")} *</label>
    <button id={id} type="button" data-fundraiser-trigger aria-expanded={open} aria-controls={listId} aria-haspopup="listbox"
      className="flex min-h-[47px] w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--input)] bg-[var(--card)] px-3.5 py-3 text-start text-sm outline-none hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
      {value ? <FundraiserProfile row={value} /> : <span className="text-[var(--muted-foreground)]">{t("booksChooseOption")}</span>}
      <ChevronDown size={17} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLButtonElement>("button[data-fundraiser-trigger]")?.focus(); return; }
        if (loading || (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter")) return;
        const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("button[data-fundraiser-option]:not(:disabled)") ?? []);
        if (event.target instanceof HTMLInputElement && event.key === "Enter") { event.preventDefault(); options[0]?.click(); return; }
        if (event.key === "Enter") return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % Math.max(1, options.length)
          : index <= 0 ? options.length - 1 : index - 1;
        options[next]?.focus();
      }}>
      <div className="relative border-b border-[var(--border)] p-2">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute start-5 top-6 text-[var(--muted-foreground)]" />
        <Input type="search" value={search} maxLength={100} className="ps-9" role="combobox" aria-expanded={open}
          aria-controls={listId} aria-autocomplete="list" aria-label={t("assignFindFundraiser")} placeholder={t("assignFindFundraiser")}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
          onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div id={listId} role="listbox" aria-label={t("peopleCollectors")} aria-busy={loading}
        className="max-h-[250px] overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent]">
        {loading ? <div role="status" aria-label={t("working")} className="space-y-2 p-1">{Array.from({ length: 3 }, (_, index) =>
          <div key={index} aria-hidden="true" className="flex items-center gap-3 rounded-lg p-2.5">
            <span className="size-10 shrink-0 animate-pulse rounded-full bg-[var(--muted)] motion-reduce:animate-none" />
            <span className="flex-1 space-y-2"><span className="block h-3.5 w-2/3 animate-pulse rounded bg-[var(--muted)] motion-reduce:animate-none" />
              <span className="block h-2.5 w-4/5 animate-pulse rounded bg-[var(--muted)] motion-reduce:animate-none" />
              <span className="block h-2.5 w-1/2 animate-pulse rounded bg-[var(--muted)] motion-reduce:animate-none" /></span>
          </div>)}</div>
          : query.error != null ? <p role="alert" className="p-3 text-xs text-[var(--danger)]">{t(booksError(query.error))}</p>
          : rows.length === 0 ? <p className="p-4 text-center text-xs text-[var(--muted-foreground)]">{t(leftoverOnly ? "leftoversNoEligibleFundraisers" : "peopleEmpty")}</p>
          : rows.map((row) => <button key={row.id} type="button" role="option" data-fundraiser-option aria-selected={value?.id === row.id}
            disabled={excludedIds.includes(row.id) || (leftoverOnly && !row.leftoverEligible)}
            onClick={() => choose(row)}
            className={`mb-1 flex w-full items-center gap-2 rounded-lg border p-2.5 text-start transition-colors outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40 ${value?.id === row.id ? "border-[var(--primary)] bg-[var(--accent)]" : "border-transparent"}`}>
            <FundraiserProfile row={row} />
            {value?.id === row.id && <Check size={17} aria-hidden="true" className="shrink-0 text-[var(--primary)]" />}
          </button>)}
      </div>
      {query.data && !loading && <div className="px-2"><LookupPages page={query.data.page} total={query.data.total}
        size={query.data.pageSize} loading={loading} onPage={setPage} /></div>}
    </div>}
    {leftoverOnly && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{t("peopleLeftoverHelp")}</p>}
    {value && <div className="mt-2 text-xs"><FundraiserWarning accountId={accountId} collectorId={value.id} /></div>}
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
  const fetchData = useCallback(async () => masterOptionsResponseSchema.parse(await booksRequest(`/api/v1/masters/options?${params}`)), [params]);
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
