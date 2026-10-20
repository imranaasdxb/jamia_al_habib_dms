"use client";
import { useCallback, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { mastersError, mastersRequest } from "@/modules/masters/masters.client";
import { mastersResponseSchema } from "@/modules/masters/masters.schema";
import type { MasterValues } from "@/modules/masters/masters.schema";

export function MasterParentSelect({ accountId, bank, donation = false, level, value, onChange, currentName, error }: {
  accountId: string; bank: boolean; donation?: boolean; level: MasterValues["level"]; value: string;
  onChange: (id: string) => void; currentName: string; error: boolean;
}) {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const parentLevel = level === "DISTRICT" ? "STATE" : level === "BLOCK" ? "DISTRICT" : "BLOCK";
  const kind = donation ? "DONATION_CATEGORY" : bank ? "BANK" : "AREA";
  const params = new URLSearchParams({ kind, level: bank || donation ? "" : parentLevel, search: search.trim(), page: String(page) }).toString();
  const fetchOptions = useCallback(async () => mastersResponseSchema.parse(await mastersRequest(`/api/v1/masters/options?${params}`)), [params]);
  const query = usePageQuery(`${accountId}:masters:options:${kind}:${params}`, fetchOptions, { delay: search ? 300 : 0 });
  const loading = query.loading || query.stale;
  const options = query.data?.data ?? [];
  return <div className="masters-parent-field">
    <label htmlFor="master-parent" className="field-label">{t(donation ? "mastersDonationCategory" : bank ? "mastersBank" : "mastersParent")} *</label>
    <Input type="search" maxLength={100} placeholder={t("mastersParentSearch")} aria-label={t("mastersParentSearch")}
      value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    <select id="master-parent" className="input" required aria-invalid={error} aria-busy={loading}
      aria-describedby={error ? "master-parent-error" : undefined} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t("mastersChooseParent")}</option>
      {value && !options.some((row) => row.id === value) && <option value={value}>{currentName || value}</option>}
      {options.map((row) => <option key={row.id} value={row.id}>{language === "ur" ? row.nameUr : row.nameEn}</option>)}
    </select>
    {loading && <span className="field-hint" role="status">{t("working")}</span>}
    {error && <span id="master-parent-error" className="field-error" role="alert">{t("mastersInvalidParent")}</span>}
    {query.error != null && <span className="field-error" role="alert">{t(mastersError(query.error))}</span>}
    {query.data && query.data.meta.total > query.data.meta.pageSize && <div className="masters-parent-pagination">
      <Button variant="ghost" size="small" disabled={loading || query.data.meta.page <= 1} onClick={() => setPage(query.data!.meta.page - 1)}>{t("usersPrevious")}</Button>
      <Button variant="ghost" size="small" disabled={loading || query.data.meta.page * query.data.meta.pageSize >= query.data.meta.total}
        onClick={() => setPage(query.data!.meta.page + 1)}>{t("usersNext")}</Button>
    </div>}
  </div>;
}
