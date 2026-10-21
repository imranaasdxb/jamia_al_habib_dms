"use client";
import { useCallback, useId, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { mastersResponseSchema } from "@/modules/masters/masters.schema";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MasterKind, MasterRow } from "@/modules/masters/masters.schema";

export function BookMasterSelect({ accountId, kind, value, onChange, onOptionChange, label, parentId, currentName, required = false, error = false, disabled = false, searchable = false }: {
  accountId: string; kind: MasterKind; value: string; onChange: (value: string) => void; parentId?: string; currentName?: string;
  label: MessageKey; required?: boolean; error?: boolean; disabled?: boolean; searchable?: boolean;
  onOptionChange?: (row: MasterRow | null) => void;
}) {
  const { t, language } = useLanguage();
  const id = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedName, setSelectedName] = useState("");
  const params = new URLSearchParams({ kind, level: "", search: search.trim(), page: String(page), ...(parentId ? { parentId } : {}) }).toString();
  const fetchOptions = useCallback(async () => mastersResponseSchema.parse(await booksRequest(`/api/v1/masters/options?${params}`)), [params]);
  const query = usePageQuery(`${accountId}:masters:options:${kind}:${params}`, fetchOptions, { enabled: !disabled, delay: search ? 300 : 0 });
  const loading = query.loading || query.stale;
  const options = query.data?.data ?? [];
  const optionValue = (row: (typeof options)[number]) => kind === "TOKEN_VALUE" ? row.tokenValue : kind === "BOOK_TYPE" ? row.code : row.id;
  return <div className={"books-master-select min-w-0 [&_>_.input_+_.input]:mt-[8px]"}><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor={id}>{t(label)}{required && " *"}</label>
    {searchable && <Input type="search" maxLength={100} value={search} placeholder={t("booksEditionSearch")} aria-label={t("booksEditionSearch")}
      onChange={(event) => { setSearch(event.target.value); setPage(1); }} />}
    <select id={id} className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} required={required} aria-invalid={error} disabled={disabled} aria-busy={loading && !disabled}
      value={value} onChange={(event) => {
        const row = options.find((item) => optionValue(item) === event.target.value);
        setSelectedName(row ? language === "ur" ? row.nameUr : row.nameEn : ""); onChange(event.target.value); onOptionChange?.(row ?? null);
      }}>
      <option value="">{t(required ? "booksChooseOption" : "booksAllOptions")}</option>
      {value && !options.some((row) => optionValue(row) === value) && <option value={value}>
        {currentName || selectedName || (value === "REGULAR" ? t("booksRegular") : value === "TOKEN" ? t("booksToken") : t("booksSelectedOption"))}</option>}
      {options.map((row) => <option key={row.id} value={optionValue(row)}>{language === "ur" ? row.nameUr : row.nameEn}</option>)}
    </select>
    {error && <span className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"}>{t("booksInvalidField")}</span>}
    {kind === "EDITION" && query.data && !loading && options.length === 0 && <span className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"}>{t("booksNoEditions")}</span>}
    {query.error != null && <span className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"} role="alert">{t(booksError(query.error))}</span>}
    {query.data && query.data.meta.total > query.data.meta.pageSize && <div className={"books-lookup-pages flex justify-between"}>
      <Button variant="ghost" size="small" disabled={loading || query.data.meta.page <= 1} onClick={() => setPage(query.data!.meta.page - 1)}>{t("usersPrevious")}</Button>
      <Button variant="ghost" size="small" disabled={loading || query.data.meta.page * query.data.meta.pageSize >= query.data.meta.total}
        onClick={() => setPage(query.data!.meta.page + 1)}>{t("usersNext")}</Button></div>}
  </div>;
}
