"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AuthField } from "@/modules/auth/components/auth-field";
import { BookMasterSelect } from "@/modules/books/components/book-master-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { displayMoney, parseMoney } from "@/modules/books/returns.schema";
import { amountInWords, newReceipt, receiptBookResponseSchema, receiptComplete, receiptValuesSchema } from "@/modules/receipts/receipts.schema";
import { receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { DonorLookup } from "@/modules/receipts/components/receipt-lookups";
import type { ReactNode } from "react";
import type { ReceiptBook, ReceiptHeader, ReceiptRecord, ReceiptValues, DonorSuggestion } from "@/modules/receipts/receipts.schema";
import type { MessageKey } from "@/lib/i18n/messages";

type EditorHead = { categoryId: string; headId: string; purpose: string; amount: string; needsDetail: boolean };
type Editor = Omit<ReceiptValues, "amountPaise" | "heads"> & { amount: string; heads: EditorHead[] };
const inputMoney = (value: number | null) => value === null ? "" : (value / 100).toFixed(2);
function editor(value: ReceiptValues): Editor { const { amountPaise, heads, ...rest } = value; return { ...rest, amount: inputMoney(amountPaise), heads: heads.map((row) => ({
  categoryId: row.categoryId, headId: row.headId, purpose: row.purpose, amount: inputMoney(row.amountPaise), needsDetail: false })) }; }
export function ReceiptForm({ accountId, number, header, record: initial, page, onSaved, onBusyChange, allowEdit = false, onReadyChange, onDirtyChange, actions, messages }: {
  accountId: string; number: number; header: ReceiptHeader; record: ReceiptRecord | null; page: number;
  onSaved: (book: ReceiptBook) => void; onBusyChange: (value: boolean) => void;
  allowEdit?: boolean; onReadyChange?: (ready: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  actions?: ReactNode; messages?: ReactNode;
}) {
  const { t, language } = useLanguage(); const [record, setRecord] = useState(initial);
  const [fields, setFields] = useState(() => { const draft = editor(initial?.values ?? newReceipt(number, header)); return { ...draft,
    heads: draft.heads.map((head) => ({ ...head, needsDetail: initial?.labels[head.headId]?.needsDetail ?? false })) }; });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  const busy = saving; const locked = header.finalized && !allowEdit;
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  const field = <K extends keyof Editor>(key: K, value: Editor[K]) => setFields((current) => ({ ...current, [key]: value }));
  const chooseDonor = useCallback((value: DonorSuggestion) => setFields((current) => ({ ...current, ...value, email: current.email })), []);
  const { amount, heads, ...details } = fields;
  const values: ReceiptValues = { ...details, receiverName: header.returned.collectorName, amountPaise: parseMoney(amount), heads: heads.map((row) => ({ categoryId: row.categoryId, headId: row.headId, purpose: row.purpose, amountPaise: parseMoney(row.amount) })) };
  const headTotal = values.heads.reduce((sum, row) => sum + (row.amountPaise ?? 0), 0);
  const ready = receiptComplete(values, header) && heads.every((row) => !row.needsDetail || row.purpose.trim());
  const parsedValues = receiptValuesSchema.safeParse(values);
  const savedValues = record ? { ...record.values, receiverName: header.returned.collectorName } : undefined;
  const unchanged = parsedValues.success && JSON.stringify(parsedValues.data) === JSON.stringify(savedValues);
  const checked = Boolean(record?.checked && unchanged);
  useEffect(() => { onReadyChange?.(checked && !busy); }, [checked, busy, onReadyChange]);
  const dirty = !parsedValues.success || JSON.stringify(parsedValues.data) !== JSON.stringify(savedValues ?? receiptValuesSchema.parse(newReceipt(number, header)));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty && initial && initial.version !== record?.version) {
      setRecord(initial);
      const next = editor(initial.values);
      setFields({ ...next, heads: next.heads.map((row) => ({ ...row, needsDetail: initial.labels[row.headId]?.needsDetail ?? false })) });
    }
  }, [initial, record?.version, dirty]);
  const labelFor = (id: string) => { const label = record?.labels[id]; return label ? language === "ur" ? label.nameUr : label.nameEn : ""; };
  function head(index: number, patch: Partial<EditorHead>) { setFields((current) => ({ ...current, heads: current.heads.map((row, at) => at === index ? { ...row, ...patch } : row) })); }
  function changeAmount(value: string) {
    const parsed = parseMoney(value); const previous = parseMoney(fields.amount);
    setFields((current) => ({ ...current, amount: value, amountWords: parsed !== null && (!current.amountWords || (previous !== null && current.amountWords === amountInWords(previous)))
      ? amountInWords(parsed) : current.amountWords }));
  }
  async function save(markChecked = false) {
    if (busy || locked) return; setError(null);
    const parsed = receiptValuesSchema.safeParse(values);
    if (!parsed.success || (amount !== "" && values.amountPaise === null) || heads.some((row) => row.amount !== "" && parseMoney(row.amount) === null)) { setError("receiptInvalid"); return; }
    setSaving(true); onBusyChange(true);
    try {
      const result = receiptBookResponseSchema.parse(await receiptRequest(`/api/v1/receipt-entry/${header.returned.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SAVE", number, version: record?.version ?? null, values: parsed.data, checked: markChecked, page }) }));
      const saved = result.data.rows.find((row) => row.number === number)?.record;
      if (saved) setRecord(saved);
      onSaved(result.data);
    } catch (failure) { setError(receiptError(failure)); } finally { setSaving(false); onBusyChange(false); }
  }
  const control = "w-full min-h-9 rounded-lg border border-border bg-card px-2.5 py-2 text-xs";
  const textField = (key: "donorName" | "parentName" | "village" | "postOffice" | "block" | "district" | "state" | "pin", label: MessageKey, required = false) =>
    <AuthField id={`receipt-${key}`} label={t(label)} required={required} maxLength={key === "pin" ? 6 : 120} value={fields[key]} onChange={(event) => field(key, key === "pin" ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)} />;
  return <form className="flex h-full min-h-0 flex-col [&_.field-label]:mb-1 [&_.field-label]:text-[11px] [&_.input]:min-h-9 [&_.input]:rounded-lg [&_.input]:px-2.5 [&_.input]:py-2 [&_.input]:text-xs [&_select]:min-h-9 [&_select]:text-xs [&_.field-hint]:text-[10px]" onSubmit={(event) => event.preventDefault()}>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-1 pe-2 [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]">
    <fieldset disabled={busy || locked} className="m-0 min-w-0 border-0 p-0 disabled:opacity-90">
      <div className="overflow-hidden rounded-2xl border-2 border-primary/30 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-primary/20 bg-accent/50 px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.2em] text-primary">{t("receiptEntry")}</p><h2 className="mt-1 text-xl font-bold text-primary">Jamia Al Habib</h2></div>
          <div className="text-end"><span className="text-xs text-muted-foreground">{t("receiptNumber")}</span><strong className="ms-2 text-2xl" dir="ltr">{number}</strong><div className="mt-1"><Badge tone={checked ? "success" : "warning"}>{t(checked ? "submissionChecked" : ready ? "receiptComplete" : "receiptIncompleteLabel")}</Badge></div></div></div>
        <div className="grid gap-4 border-b border-border p-4 sm:grid-cols-3"><div><label className="mb-1 block text-[11px] font-semibold" htmlFor="receipt-status">{t("status")}</label><select id="receipt-status" className={control} value={fields.status} onChange={(event) => {
          const status = event.target.value as ReceiptValues["status"];
          setFields((current) => ({ ...current, status, heads: status === "VALID" ? current.heads.length ? current.heads : [{ categoryId: "", headId: "", purpose: "", amount: "", needsDetail: false }] : [],
            amount: status === "VALID" && header.tokenValuePaise !== null ? inputMoney(header.tokenValuePaise) : status !== "VALID" && current.amount === "" ? "0" : current.amount }));
        }}>{(["VALID", "CANCELLED", "TORN", "LOST", "BLANK"] as const).map((status) => <option key={status} value={status}>{t(({ VALID: "receiptValid", CANCELLED: "returnsCancelled", TORN: "returnsTorn", LOST: "booksLost", BLANK: "receiptBlank" } as const)[status])}</option>)}</select></div>
          <AuthField id="receipt-date" label={t("date")} type="date" required min={header.assignmentDate} max={header.returned.returnDate} value={fields.date} onChange={(event) => field("date", event.target.value)} />
          <AuthField id="receipt-amount" label={t("receiptAmount")} type="number" min="0" step="0.01" required value={amount} readOnly={fields.status === "VALID" && header.bookType === "TOKEN"} onChange={(event) => changeAmount(event.target.value)} /></div>
        {fields.status !== "VALID" ? <section className="space-y-4 p-5"><p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t("receiptNonValidHelp")}</p>
          <BookMasterSelect accountId={accountId} kind="RECEIPT_REASON" label="returnsReceiptReason" required value={fields.reasonId} currentName={labelFor(fields.reasonId)} onChange={(value) => field("reasonId", value)} /></section>
          : <div className="grid lg:grid-cols-[minmax(260px,.8fr)_minmax(0,1.7fr)]">
            <section className="border-b border-border bg-muted/20 p-4 lg:border-e lg:border-b-0"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-xs font-bold">{t("receiptHeads")}</h3><Button variant="outline" size="small" disabled={heads.length >= 20} onClick={() => field("heads", [...heads, { categoryId: "", headId: "", purpose: "", amount: "", needsDetail: false }])}><Plus size={13} />{t("receiptAddHead")}</Button></div>
              <div className="grid grid-cols-[1fr_1fr_80px] gap-2 border-y border-border py-2 text-[10px] font-semibold text-muted-foreground"><span>{t("receiptCategory")}</span><span>{t("receiptHead")}</span><span>{t("receiptAmount")}</span></div>
              {heads.map((row, index) => <div key={index} className="space-y-2 border-b border-border py-3"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px] gap-2 [&>div]:min-w-0 [&>div:not(:last-child)_.field-label]:sr-only">
                <BookMasterSelect accountId={accountId} kind="DONATION_CATEGORY" label="receiptCategory" required value={row.categoryId} currentName={labelFor(row.categoryId)} onChange={(categoryId) => head(index, { categoryId, headId: "", purpose: "", needsDetail: false })} />
                <BookMasterSelect accountId={accountId} kind="DONATION_HEAD" label="receiptHead" required parentId={row.categoryId || undefined} disabled={!row.categoryId} value={row.headId} currentName={labelFor(row.headId)} onChange={(headId) => head(index, { headId })} onOptionChange={(option) => head(index, { needsDetail: option?.needsDetail ?? false })} />
                <AuthField id={`head-amount-${index}`} label={t("receiptAmount")} required type="number" min="0" step="0.01" value={row.amount} onChange={(event) => head(index, { amount: event.target.value })} />
                <div className="col-span-3"><AuthField id={`head-purpose-${index}`} label={t("receiptPurpose")} required={row.needsDetail} maxLength={300} value={row.purpose} onChange={(event) => head(index, { purpose: event.target.value })} /></div></div>
                <Button variant="ghost" size="small" onClick={() => field("heads", heads.filter((_, at) => at !== index))}><X size={13} />{t("assignRemove")}</Button></div>)}
              <div className={`mt-3 rounded-lg p-3 text-sm font-bold ${headTotal === values.amountPaise ? "bg-accent text-primary" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{t("receiptHeadTotal")}: {displayMoney(headTotal, language)}</div>
            </section>
            <section className="space-y-4 p-4"><label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-primary" checked={fields.anonymous} onChange={(event) => field("anonymous", event.target.checked)} />{t("receiptAnonymous")}</label>
              <div className="grid gap-3 sm:grid-cols-2">{textField("donorName", "receiptDonorName", !fields.anonymous)}<AuthField id="receipt-phone" label={t("usersMobile")} required={!fields.anonymous} inputMode="numeric" maxLength={10} value={fields.phone} onChange={(event) => field("phone", event.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
              {!locked && <DonorLookup accountId={accountId} phone={fields.phone} name={fields.donorName} onChoose={chooseDonor} />}
              <div className="grid gap-3 sm:grid-cols-[100px_1fr]"><div><label className="mb-1 block text-[11px] font-semibold" htmlFor="receipt-parentage">{t("receiptParentage")}</label><select id="receipt-parentage" className={control} value={fields.parentage} onChange={(event) => field("parentage", event.target.value as ReceiptValues["parentage"])}><option value="S/O">S/o</option><option value="D/O">D/o</option><option value="W/O">W/o</option></select></div>{textField("parentName", "receiptParentName", !fields.anonymous)}</div>
              <div className="grid gap-3 sm:grid-cols-3">{textField("village", "receiptVillage", true)}{textField("postOffice", "receiptPostOffice", true)}{textField("block", "receiptBlock")}{textField("district", "receiptDistrict", true)}{textField("state", "receiptState", true)}{textField("pin", "receiptPin", true)}</div>
              <AuthField id="receipt-words" label={t("receiptWords")} required maxLength={500} value={fields.amountWords} onChange={(event) => field("amountWords", event.target.value)} hint={t("receiptWordsHint")} />
              <div className="border-y border-border py-3"><label className="mb-1 block text-[11px] font-semibold" htmlFor="receipt-payment">{t("receiptPayment")}</label><select id="receipt-payment" className={control} value={fields.paymentMode} onChange={(event) => field("paymentMode", event.target.value as ReceiptValues["paymentMode"])}><option value="CASH">{t("receiptCash")}</option><option value="DIGITAL">{t("receiptDigital")}</option><option value="CHEQUE">{t("receiptCheque")}</option></select>
                {fields.paymentMode === "DIGITAL" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><BookMasterSelect accountId={accountId} kind="UPI_APP" label="receiptUpiApp" required value={fields.upiAppId} currentName={labelFor(fields.upiAppId)} onChange={(value) => field("upiAppId", value)} />
                  <AuthField id="receipt-reference" label={t("receiptUtr")} required maxLength={100} value={fields.reference} onChange={(event) => field("reference", event.target.value.toUpperCase())} /><AuthField id="receipt-transaction-date" label={t("receiptTransactionDate")} type="date" value={fields.transactionDate} onChange={(event) => field("transactionDate", event.target.value)} /></div>}
                {fields.paymentMode === "CHEQUE" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><AuthField id="receipt-cheque" label={t("receiptChequeNumber")} required maxLength={6} value={fields.chequeNumber} onChange={(event) => field("chequeNumber", event.target.value.replace(/\D/g, "").slice(0, 6))} /><BookMasterSelect accountId={accountId} kind="BANK" label="receiptBank" required searchable value={fields.bankId} currentName={labelFor(fields.bankId)} onChange={(value) => field("bankId", value)} /><AuthField id="receipt-branch" label={t("receiptBranch")} required maxLength={160} value={fields.branch} onChange={(event) => field("branch", event.target.value)} /><AuthField id="receipt-cheque-date" label={t("receiptChequeDate")} type="date" required value={fields.chequeDate} onChange={(event) => field("chequeDate", event.target.value)} /></div>}
              </div>
              <div className="flex flex-wrap gap-4 border-t border-dashed border-border pt-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={fields.donorSigned} onChange={(event) => field("donorSigned", event.target.checked)} />{t("receiptDonorSigned")}</label><label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" checked={fields.receiverSigned} onChange={(event) => field("receiverSigned", event.target.checked)} />{t("receiptReceiverSigned")}</label></div>
            </section>
          </div>}
        <div className="space-y-3 border-t border-border p-4"><label className="block text-xs font-semibold" htmlFor="receipt-remarks">{t("usersRemarks")}</label><textarea id="receipt-remarks" rows={2} maxLength={1000} value={fields.remarks} onChange={(event) => field("remarks", event.target.value)} className={control} /></div>
      </div>
    </fieldset>
    {messages}
    </div>
    <div className="z-10 shrink-0 space-y-2 border-t border-border bg-card px-3 py-2.5 shadow-[0_-3px_12px_rgb(0_0_0/0.03)]">
      {error && <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]" role="alert">{t(error)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {actions}
        {!locked && <div className="ms-auto flex gap-2">{!header.finalized && <Button variant="outline" size="small" loading={saving} disabled={busy} onClick={() => { void save(); }}>{t("receiptSaveDraft")}</Button>}
          <Button size="small" loading={saving} disabled={busy || !ready || checked} onClick={() => { void save(true); }}>{t(header.finalized ? "submissionSaveCorrection" : "submissionMarkChecked")}</Button></div>}
      </div>
    </div>
  </form>;
}
