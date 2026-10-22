"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthField } from "@/modules/auth/components/auth-field";
import { AssignmentAreas, AssignmentFundraiser } from "@/modules/books/components/assignment-lookups";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { booksResponseSchema } from "@/modules/books/books.schema";
import { assignmentDefaultsSchema, assignmentSavedSchema, assignmentValuesSchema, indiaToday, returnDate } from "@/modules/books/assignments.schema";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@/modules/auth/auth.types";
import type { BookRow } from "@/modules/books/books.schema";
import type { CollectorRow } from "@/modules/people/people.schema";
import type { AssignmentDetail } from "@/modules/books/assignments.schema";
import type { MessageKey } from "@/lib/i18n/messages";
import type { FormEvent } from "react";
import type { LeftoverRow } from "@/modules/books/leftovers.schema";

export function AssignmentForm({ account, initialId, initialCode, leftovers, onBusyChange, onSaved }: { account: Account; initialId: string; initialCode: string; leftovers?: LeftoverRow[];
  onBusyChange: (value: boolean) => void; onSaved: (value: AssignmentDetail, replayed: boolean) => void;
}) {
  const { t, language } = useLanguage(); const cache = usePageDataCache();
  const [collector, setCollector] = useState<CollectorRow | null>(null);
  const [areas, setAreas] = useState<{ id: string; nameEn: string; nameUr: string }[]>([]);
  const [selected, setSelected] = useState<BookRow[]>(() => leftovers?.map((row) => ({ ...row.book, receiptFrom: row.receiptFrom, receiptTo: row.receiptTo,
    totalReceipts: row.receiptTo - row.receiptFrom + 1, faceValuePaise: row.book.tokenValuePaise === null ? null : (row.receiptTo - row.receiptFrom + 1) * row.book.tokenValuePaise })) ?? []);
  const [date, setDate] = useState(indiaToday); const [expected, setExpected] = useState(() => returnDate(indiaToday(), 11));
  const [remarks, setRemarks] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  const returnEdited = useRef(false); const operation = useRef<{ id: string; values: string } | null>(null);
  const fetchDefaults = useCallback(async () => assignmentDefaultsSchema.parse(await booksRequest("/api/v1/book-assignments/defaults")), []);
  const defaults = usePageQuery(`${account.id}:assignments:defaults`, fetchDefaults);
  const months = defaults.data?.data.returnMonths ?? 11;
  useEffect(() => { if (!returnEdited.current) setExpected(returnDate(date, months)); }, [date, months]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError(null);
    const parsed = assignmentValuesSchema.safeParse({ assignmentDate: date, expectedReturnDate: expected, collectorId: collector?.id,
      source: leftovers ? "LEFTOVER" : "NEW", leftoverIds: leftovers?.filter((row) => selected.some((book) => book.id === row.book.id)).map((row) => row.id) ?? [],
      areaIds: areas.map((row) => row.id), bookIds: selected.map((row) => row.id), remarks });
    if (!parsed.success || date > indiaToday()) { setError("assignInvalid"); return; }
    if (leftovers && !collector?.leftoverEligible) { setError("leftoversFundraiserIneligible"); return; }
    const activeLeftovers = leftovers?.filter((row) => selected.some((book) => book.id === row.book.id));
    if (activeLeftovers?.some((row) => date < row.returnDate)) { setError("leftoversDateInvalid"); return; }
    const serialized = JSON.stringify(parsed.data);
    if (!operation.current || operation.current.values !== serialized) operation.current = { id: crypto.randomUUID(), values: serialized };
    setBusy(true); onBusyChange(true);
    try {
      const result = assignmentSavedSchema.parse(await booksRequest("/api/v1/book-assignments", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: operation.current.id, values: parsed.data }) }));
      onSaved({ assignment: result.data.assignment, books: result.data.books }, result.data.replayed);
    } catch (failure) {
      setError(booksError(failure));
      if (failure instanceof Error && ["ASSIGNMENT_CHANGED", "ASSIGNMENT_FUNDRAISER", "ASSIGNMENT_AREAS", "LEFTOVER_CHANGED", "LEFTOVER_FUNDRAISER_INELIGIBLE"].includes(failure.message)) {
        cache.invalidate(`${account.id}:assignments:stock:`); cache.invalidate(`${account.id}:people:query:`);
        cache.invalidate(`${account.id}:people:eligible:query:`);
        if (failure.message === "LEFTOVER_FUNDRAISER_INELIGIBLE") setCollector(null);
        if (leftovers) cache.invalidate(`${account.id}:leftovers:`);
        cache.invalidate(`${account.id}:masters:options:AREA:`);
      }
    }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <form className={"assignment-form pt-[24px]"} onSubmit={submit} aria-busy={busy}><fieldset disabled={busy} className={"assignment-form-fields [border:0] p-0 m-0 min-w-0 grid gap-[22px] [&:disabled]:opacity-[.75] [&_h3]:text-[length:14px] [&_h3]:m-[0_0_8px] [&_textarea]:[font:inherit] [&_textarea]:[resize:vertical] [&_select]:mt-[8px]"}>
    <div className={"books-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[22px] max-[700px]:grid-cols-[1fr]"}><AuthField id="assignment-date" label={t("assignDate")} required type="date" value={date} max={indiaToday()} onChange={(event) => setDate(event.target.value)} />
      <AuthField id="assignment-return" label={t("assignReturnDate")} required type="date" min={date} value={expected}
        onChange={(event) => { returnEdited.current = true; setExpected(event.target.value); }} />
      <AuthField id="assignment-by" label={t("assignBy")} value={account.fullName} readOnly />
      <div className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7] assignment-default-hint self-center"}>{t("assignDefaultReturn")} {months} {t("assignMonths")}</div></div>
    {defaults.error != null && <p className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(defaults.error))}</p>}
    <div className={"books-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[22px] max-[700px]:grid-cols-[1fr]"}><AssignmentFundraiser accountId={account.id} value={collector} initialId={initialId} initialCode={initialCode} onChange={setCollector}
      leftoverOnly={Boolean(leftovers)} />
      <AssignmentAreas accountId={account.id} value={areas} onChange={setAreas} /></div>
    <div><h3>{t("assignSelectBooks")} · {selected.length}/150</h3><p className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"}>{t(leftovers ? "leftoversFormHelp" : "assignNewOnly")}</p>
      {!leftovers && <AvailableStock key={date} accountId={account.id} date={date} selected={selected} onSelect={(row) => {
        if (selected.length < 150 && !selected.some((item) => item.id === row.id)) setSelected([...selected, row]);
      }} />}
      {selected.length > 0 && <div className={"books-preview-scroll max-h-[320px] overflow-auto [border:1px_solid_var(--border)] rounded-[var(--radius)] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)] assignment-selected mt-[18px] [&_table]:min-w-[620px]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6]"}><thead><tr>
        <th scope="col">{t("booksNumber")}</th><th scope="col">{t("mastersEditions")}</th><th scope="col">{t("booksReceiptRange")}</th><th scope="col">{t("booksTotalReceipts")}</th><th scope="col">{t("assignRemove")}</th>
      </tr></thead><tbody>{selected.map((row) => <tr key={row.id}><td>{row.bookNumber}{leftovers && <span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{leftovers.find((item) => item.book.id === row.id)?.code}</span>}</td><td>{language === "ur" ? row.editionNameUr : row.editionNameEn}</td>
        <td><bdi dir="ltr">{row.receiptFrom} – {row.receiptTo}</bdi></td><td>{row.totalReceipts}</td><td><Button variant="ghost" size="icon" aria-label={`${t("assignRemove")} ${row.bookNumber}`} onClick={() => setSelected(selected.filter((item) => item.id !== row.id))}><X size={16} /></Button></td></tr>)}</tbody></table></div>}
    </div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="assignment-remarks">{t("usersRemarks")}</label>
    <textarea className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} id="assignment-remarks" rows={3} value={remarks} maxLength={1000} onChange={(event) => setRemarks(event.target.value)} />
    {error && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] error"} role="alert">{t(error)}</p>}
    <div className={"books-form-footer flex justify-end pt-[20px] [border-top:1px_solid_var(--border)]"}><Button type="submit" loading={busy} disabled={!collector || areas.length === 0 || selected.length === 0 || !defaults.data || defaults.loading || defaults.error != null}>
      {t(busy ? "usersSaving" : "assignSave")}</Button></div>
  </fieldset></form>;
}
function AvailableStock({ accountId, date, selected, onSelect }: { accountId: string; date: string; selected: BookRow[]; onSelect: (row: BookRow) => void }) {
  const { t, language } = useLanguage(); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const params = new URLSearchParams({ search: search.trim(), date, page: String(page) }).toString();
  const fetchData = useCallback(async () => booksResponseSchema.parse(await booksRequest(`/api/v1/book-assignments/stock?${params}`)), [params]);
  const query = usePageQuery(`${accountId}:assignments:stock:${params}`, fetchData, { enabled: /^\d{4}-\d{2}-\d{2}$/.test(date), delay: search ? 300 : 0 });
  return <div className={"assignment-stock grid gap-[12px]"}><Input type="search" value={search} maxLength={100} placeholder={t("assignFindBooks")} aria-label={t("assignFindBooks")}
    onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
    onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    {query.loading && !query.data && <p className={"muted text-[color:var(--muted-foreground)]"} role="status">{t("working")}</p>}
    {query.error != null && <p className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</p>}
    <div className={"assignment-stock-options max-h-[260px] overflow-y-auto [border:1px_solid_var(--border)] rounded-[var(--radius)] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:justify-between [&_>_div]:gap-[16px] [&_>_div]:p-[12px_15px] [&_>_div]:[border-bottom:1px_solid_var(--border)] [&_>_div]:text-[length:12px] [&_>_div:last-child]:[border-bottom:0]"}>{query.data?.data.map((row) => <div key={row.id}>
      <span><strong>{row.bookNumber}</strong><span className={"books-secondary block w-[fit-content] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px]"}>{language === "ur" ? row.editionNameUr : row.editionNameEn} · {t(row.bookType === "TOKEN" ? "booksToken" : "booksRegular")}
        {row.tokenValuePaise != null && ` ${formatCurrency(row.tokenValuePaise / 100)}`} · <bdi dir="ltr">{row.receiptFrom}–{row.receiptTo}</bdi></span></span>
      <Button variant="outline" size="small" disabled={selected.length >= 150 || selected.some((item) => item.id === row.id)} onClick={() => onSelect(row)} aria-label={`${t("assignSelectBooks")} ${row.bookNumber}`}><Plus size={16} /></Button>
    </div>)}</div>
    {query.data && !query.loading && query.data.data.length === 0 && <p className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"}>{t("assignNoStock")}</p>}
    {query.data && query.data.meta.total > query.data.meta.pageSize && <div className={"books-lookup-pages flex justify-between"}>
      <Button variant="ghost" size="small" disabled={query.loading || query.data.meta.page <= 1} onClick={() => setPage(query.data!.meta.page - 1)}>{t("usersPrevious")}</Button>
      <Button variant="ghost" size="small" disabled={query.loading || query.data.meta.page * query.data.meta.pageSize >= query.data.meta.total} onClick={() => setPage(query.data!.meta.page + 1)}>{t("usersNext")}</Button></div>}
  </div>;
}
