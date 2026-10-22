"use client";
import { useId } from "react";
import { useLanguage } from "@/components/language-provider";
import { RECEIPT_REASON_OPTIONS } from "@/modules/receipts/receipt-options";
import type { MessageKey } from "@/lib/i18n/messages";

type Option = { id: string; nameEn: string; nameUr: string };
export function ReceiptOptionSelect({ label, value, options, onChange, currentName, disabled = false, loading = false }: {
  label: MessageKey; value: string; options: readonly Option[]; onChange: (value: string) => void;
  currentName?: string; disabled?: boolean; loading?: boolean;
}) {
  const { t, language } = useLanguage(); const id = useId();
  return <div className="min-w-0"><label htmlFor={id} className="mb-1 block text-[11px] font-semibold">{t(label)} *</label>
    <select id={id} required disabled={disabled || loading} aria-busy={loading}
      className="w-full min-h-9 rounded-lg border border-border bg-card px-2.5 py-2 text-xs disabled:opacity-60"
      value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t(loading ? "working" : "booksChooseOption")}</option>
      {value && !options.some((option) => option.id === value) && <option value={value}>{currentName || t("booksSelectedOption")}</option>}
      {options.map((option) => <option key={option.id} value={option.id}>{language === "ur" ? option.nameUr : option.nameEn}</option>)}
    </select>
  </div>;
}
const receiptReasons = RECEIPT_REASON_OPTIONS.map(({ code, ...labels }) => ({ id: code, ...labels }));
export function ReceiptReasonSelect({ value, onChange, currentName }: { value: string; onChange: (value: string) => void; currentName?: string }) {
  return <ReceiptOptionSelect label="returnsReceiptReason" value={value} onChange={onChange} currentName={currentName} options={receiptReasons} />;
}
