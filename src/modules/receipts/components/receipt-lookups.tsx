"use client";
import { useCallback, useEffect, useId } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { donorSuggestionsSchema } from "@/modules/receipts/receipts.schema";
import { mastersResponseSchema } from "@/modules/masters/masters.schema";
import type { DonorSuggestion } from "@/modules/receipts/receipts.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function DonorLookup({ accountId, phone, name, onChoose }: { accountId: string; phone: string; name: string; onChoose: (value: DonorSuggestion) => void }) {
  const { t } = useLanguage();
  const load = useCallback(async () => donorSuggestionsSchema.parse(await receiptRequest(`/api/v1/receipt-entry/donors?phone=${encodeURIComponent(phone)}`)), [phone]);
  const query = usePageQuery(`${accountId}:receipts:donors:${phone}`, load, { enabled: /^[6-9]\d{9}$/.test(phone), delay: 300 });
  useEffect(() => { const one = query.data?.data.length === 1 ? query.data.data[0] : null; if (one && one.phone === phone && !name) onChoose(one); }, [query.data, phone, name, onChoose]);
  const different = name.trim() && query.data?.data.length && !query.data.data.some((row) => row.donorName.trim().toLowerCase() === name.trim().toLowerCase());
  return <div className="space-y-2 text-xs">{query.loading && <p className="text-muted-foreground" role="status">{t("working")}</p>}
    {query.error != null && <p className="text-[var(--danger)]" role="alert">{t(receiptError(query.error))}</p>}
    {Boolean(different) && <p className="rounded-lg bg-[var(--warning-soft)] p-3 text-[var(--warning)]">{t("receiptPhoneWarning")}</p>}
    {query.data && query.data.data.length > 1 && <><p className="text-muted-foreground">{t("receiptChooseDonor")}</p><div className="flex flex-wrap gap-2">
      {query.data.data.map((row, index) => <Button key={index} variant="outline" size="small" onClick={() => onChoose(row)}>{row.donorName} · {row.parentage} {row.parentName} · {row.village}</Button>)}</div></>}
  </div>;
}
export function ReceiptSuggestionField({ accountId, kind, level = "", value, label, onChange, required = false }: {
  accountId: string; kind: "AREA" | "RESPONSIBILITY"; level?: "" | "VILLAGE" | "DISTRICT"; value: string; label: MessageKey; onChange: (value: string) => void; required?: boolean;
}) {
  const { t, language } = useLanguage(); const id = useId();
  const params = new URLSearchParams({ kind, level, search: value.trim(), page: "1" }).toString();
  const load = useCallback(async () => mastersResponseSchema.parse(await receiptRequest(`/api/v1/masters/options?${params}`)), [params]);
  const query = usePageQuery(`${accountId}:masters:options:${kind}:${params}`, load, { delay: 300 });
  return <div><label className="mb-2 block text-xs font-semibold" htmlFor={id}>{t(label)}{required && " *"}</label>
    <Input id={id} list={`${id}-list`} maxLength={160} value={value} onChange={(event) => onChange(event.target.value)} />
    <datalist id={`${id}-list`}>{query.data?.data.map((row) => <option key={row.id} value={language === "ur" ? row.nameUr : row.nameEn} />)}</datalist>
  </div>;
}
