"use client";
import { useCallback, useRef, useState } from "react";
import { Check, Search, UserRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { assignmentSavedSchema, assignmentValuesSchema, indiaToday, returnDate } from "@/modules/books/assignments.schema";
import { leftoverOptionsResponseSchema } from "@/modules/books/leftovers.schema";
import type { FormEvent } from "react";
import type { Account } from "@/modules/auth/auth.types";
import type { AssignmentDetail } from "@/modules/books/assignments.schema";
import type { LeftoverFundraiser, LeftoverRow } from "@/modules/books/leftovers.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function LeftoverReassignForm({ account, leftovers, onBusyChange, onSaved }: {
  account: Account; leftovers: LeftoverRow[]; onBusyChange: (busy: boolean) => void; onSaved: (detail: AssignmentDetail) => void;
}) {
  const { t, language } = useLanguage(); const cache = usePageDataCache();
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [areaSearch, setAreaSearch] = useState(""); const [areaInput, setAreaInput] = useState(""); const [areaPage, setAreaPage] = useState(1);
  const [collector, setCollector] = useState<LeftoverFundraiser | null>(null);
  const [areas, setAreas] = useState<{ id: string; nameEn: string; nameUr: string }[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  const operation = useRef<{ id: string; values: string } | null>(null);
  const params = new URLSearchParams({ search, areaSearch, page: String(page), areaPage: String(areaPage) }).toString();
  const load = useCallback(async () => leftoverOptionsResponseSchema.parse(await booksRequest(`/api/v1/leftover-books/options?${params}`)).data, [params]);
  const query = usePageQuery(`${account.id}:leftovers:options:${params}`, load, { enabled: !busy });
  const validCollector = collector !== null;
  const searchFundraisers = () => { setSearch(searchInput.trim()); setPage(1); };
  const searchAreas = () => { setAreaSearch(areaInput.trim()); setAreaPage(1); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError(null);
    if (!validCollector || !collector) { setError("leftoversFundraiserIneligible"); return; }
    if (!query.data || query.error != null) { setError("assignInvalid"); return; }
    const date = indiaToday();
    const parsed = assignmentValuesSchema.safeParse({ source: "LEFTOVER", assignmentDate: date,
      expectedReturnDate: returnDate(date, query.data.returnMonths), collectorId: collector.id,
      leftoverIds: leftovers.map((row) => row.id), bookIds: leftovers.map((row) => row.book.id), areaIds: areas.map((row) => row.id), remarks: "" });
    if (!parsed.success) { setError("assignInvalid"); return; }
    if (!leftovers.length || leftovers.some((row) => !row.assignable || row.status !== "AVAILABLE")) { setError("leftoversChanged"); return; }
    if (leftovers.some((row) => row.returnDate > date)) { setError("leftoversDateInvalid"); return; }
    const values = JSON.stringify(parsed.data);
    if (!operation.current || operation.current.values !== values) operation.current = { id: crypto.randomUUID(), values };
    setBusy(true); onBusyChange(true);
    try {
      const result = assignmentSavedSchema.parse(await booksRequest("/api/v1/book-assignments", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: operation.current.id, values: parsed.data }),
      })).data;
      onSaved({ assignment: result.assignment, books: result.books });
    } catch (failure) {
      setError(booksError(failure));
      if (failure instanceof Error && ["LEFTOVER_FUNDRAISER_INELIGIBLE", "ASSIGNMENT_FUNDRAISER"].includes(failure.message)) {
        setCollector(null); cache.invalidate(`${account.id}:leftovers:options:`);
      }
      if (failure instanceof Error && ["LEFTOVER_CHANGED", "ASSIGNMENT_CHANGED"].includes(failure.message)) cache.invalidate(`${account.id}:leftovers:`);
      if (failure instanceof Error && failure.message === "ASSIGNMENT_AREAS") {
        cache.invalidate(`${account.id}:masters:options:AREA:`); cache.invalidate(`${account.id}:leftovers:options:`);
      }
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <form onSubmit={submit} className="flex max-h-[calc(100dvh-14rem)] min-h-0 flex-col px-2 pt-2" aria-busy={busy}>
    <div className="shrink-0 border-b border-border pb-4">
      <div className="relative">
        <Input type="search" className="min-w-0 pe-12 hover:border-primary focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30" autoComplete="off" value={searchInput} disabled={busy} maxLength={100} placeholder={t("assignFindFundraiser")} aria-label={t("assignFindFundraiser")}
          onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchFundraisers(); } }} />
        <Button variant="ghost" size="icon" className="absolute end-1 top-1/2 size-9 min-h-9 -translate-y-1/2 p-0" disabled={busy} onClick={searchFundraisers} aria-label={t("assignFindFundraiser")}><Search size={17} aria-hidden="true" /></Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t("leftoversSelected")}: <b className="text-foreground">{leftovers.length}</b></span>
        <span>· {t("returnsRemaining")}: <b className="text-foreground">{leftovers.reduce((sum, row) => sum + row.receiptTo - row.receiptFrom + 1, 0)}</b></span>
        <span className="ms-auto">{t("leftoversEligibleFundraisers")}</span></div>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-4 pe-1 [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent]">
      {(query.loading || query.stale) && !query.data && <div role="status" aria-live="polite" aria-label={t("working")}>
        <span className="sr-only">{t("working")}</span>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="flex gap-3 rounded-xl border border-border bg-card p-3 motion-safe:animate-pulse">
            <span className="size-11 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2 py-1"><div className="h-3 w-3/4 rounded bg-muted" /><div className="h-2 w-1/3 rounded bg-muted" /><div className="h-2.5 w-2/3 rounded bg-muted" /><div className="h-2 w-4/5 rounded bg-muted" /></div>
          </div>)}
        </div>
      </div>}
      {query.loading && query.data && <p className="text-xs text-muted-foreground" role="status">{t("usersUpdating")}</p>}
      {query.error != null && <p className="text-xs text-[var(--danger)]" role="alert">{t(booksError(query.error))}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={t("peopleCollectors")}>
        {query.data?.fundraisers.map((row) => {
          const disabled = busy;
          const chosen = collector?.id === row.id;
          return <label key={row.id} className={`relative flex items-start gap-3 rounded-xl border p-3 transition-colors ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary/50"} ${chosen ? "border-primary bg-accent/40 ring-1 ring-primary/20" : "border-border bg-card"}`}>
            <input type="radio" name="leftover-fundraiser" className="sr-only peer" value={row.id} checked={chosen} disabled={disabled} onChange={() => { setCollector(row); setError(null); }} />
            <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2" aria-hidden="true" />
            <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-primary"><UserRound size={21} aria-hidden="true" />
              {row.hasPhoto && <img alt={row.fullName} loading="lazy" decoding="async" width={44} height={44} className="absolute inset-0 size-full object-cover"
                src={row.photoUrl ?? `/api/v1/people/${row.id}/photo?v=${encodeURIComponent(row.photoVersion)}`}
                onLoad={(event) => { event.currentTarget.hidden = false; }} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{row.fullName}</strong><span className="mt-0.5 block text-[10px] text-muted-foreground">{row.code}</span>
              <span className="mt-1 block text-xs text-muted-foreground" dir="ltr">{row.phone}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{row.village}, {row.district}</span></span>
            <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${chosen ? "border-primary bg-primary text-primary-foreground" : "border-border"}`} aria-hidden="true">{chosen && <Check size={11} />}</span>
          </label>;
        })}
      </div>
      {query.data && !query.loading && !query.data.fundraisers.length && <p className="rounded-xl bg-muted p-5 text-center text-xs text-muted-foreground">{t("leftoversNoEligibleFundraisers")}</p>}
      {query.data && (page > 1 || query.data.fundraiserHasMore) && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{t("usersPage")} {page}</span><div className="flex gap-2">
        <Button size="small" variant="outline" disabled={busy || query.loading || page <= 1} onClick={() => setPage(page - 1)}>{t("usersPrevious")}</Button>
        <Button size="small" variant="outline" disabled={busy || query.loading || !query.data.fundraiserHasMore} onClick={() => setPage(page + 1)}>{t("usersNext")}</Button></div></div>}
      <fieldset disabled={busy} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-semibold">{t("assignAreas")} *</legend>
        <div className="relative">
          <Input type="search" className="pe-12 hover:border-primary focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30" value={areaInput} maxLength={100} placeholder={t("assignAreas")} aria-label={t("assignAreas")}
            onChange={(event) => setAreaInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchAreas(); } }} />
          <Button variant="ghost" size="icon" className="absolute end-1 top-1/2 size-9 min-h-9 -translate-y-1/2 p-0" onClick={searchAreas} aria-label={t("assignAreas")}><Search size={17} aria-hidden="true" /></Button>
        </div>
        {areas.length > 0 && <div className="flex flex-wrap gap-2">{areas.map((area) => <Button key={area.id} variant="outline" size="small" onClick={() => setAreas((current) => current.filter((item) => item.id !== area.id))}>{language === "ur" ? area.nameUr : area.nameEn} ×</Button>)}</div>}
        <div className="grid gap-2 sm:grid-cols-2">{query.data?.areas.map((area) => <label key={area.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          <input type="checkbox" className="size-3.5 accent-primary" checked={areas.some((item) => item.id === area.id)} disabled={areas.length >= 50 && !areas.some((item) => item.id === area.id)}
            onChange={(event) => setAreas((current) => event.target.checked ? current.some((item) => item.id === area.id) ? current : [...current, area] : current.filter((item) => item.id !== area.id))} />
          {language === "ur" ? area.nameUr : area.nameEn}</label>)}</div>
        {query.data && !query.data.areas.length && <p className="text-xs text-muted-foreground">{t("assignNoAreas")}</p>}
        {query.data && (areaPage > 1 || query.data.areaHasMore) && <div className="flex justify-end gap-2">
          <Button size="small" variant="outline" disabled={query.loading || areaPage <= 1} onClick={() => setAreaPage(areaPage - 1)}>{t("usersPrevious")}</Button>
          <Button size="small" variant="outline" disabled={query.loading || !query.data.areaHasMore} onClick={() => setAreaPage(areaPage + 1)}>{t("usersNext")}</Button></div>}
      </fieldset>
      {query.data && <p className="text-[11px] text-muted-foreground">{t("assignDate")}: {indiaToday()} · {t("assignReturnDate")}: {returnDate(indiaToday(), query.data.returnMonths)}</p>}
    </div>
    <div className="shrink-0 space-y-2 border-t border-border bg-card pt-3">
      {error && <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]" role="alert">{t(error)}</p>}
      <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-xs text-muted-foreground">{collector?.fullName ?? t("booksChooseOption")}</span>
        <Button type="submit" loading={busy} disabled={!validCollector || !areas.length || !leftovers.length || !query.data || query.loading || query.error != null}>{t(busy ? "usersSaving" : "leftoversAssign")}</Button></div>
    </div>
  </form>;
}
