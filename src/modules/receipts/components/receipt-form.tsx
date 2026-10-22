"use client";
import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AuthField } from "@/modules/auth/components/auth-field";
import { BookMasterSelect } from "@/modules/books/components/book-master-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { displayMoney, parseMoney } from "@/modules/books/returns.schema";
import { amountInWords, newReceipt, receiptBookResponseSchema, receiptComplete, receiptLimitError, receiptRemaining, receiptValuesSchema } from "@/modules/receipts/receipts.schema";
import { receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { DonorLookup } from "@/modules/receipts/components/receipt-lookups";
import { ReceiptOptionSelect, ReceiptReasonSelect } from "@/modules/receipts/components/receipt-option-select";
import { RECEIPT_REASON_OPTIONS } from "@/modules/receipts/receipt-options";
import type { ReactNode } from "react";
import type { ReceiptBook, ReceiptDonationCategory, ReceiptHeader, ReceiptRecord, ReceiptTotals, ReceiptValues, DonorSuggestion } from "@/modules/receipts/receipts.schema";
import type { MessageKey } from "@/lib/i18n/messages";

type EditorHead = { categoryId: string; headId: string; purpose: string; amount: string; needsDetail: boolean };
type Editor = Omit<ReceiptValues, "amountPaise" | "heads"> & { amount: string; heads: EditorHead[] };
const inputMoney = (value: number | null) => value === null ? "" : (value / 100).toFixed(2);
function editor(value: ReceiptValues): Editor { const { amountPaise, heads, ...rest } = value; return { ...rest, amount: inputMoney(amountPaise), heads: heads.map((row) => ({
  categoryId: row.categoryId, headId: row.headId, purpose: row.purpose, amount: inputMoney(row.amountPaise), needsDetail: false })) }; }
export function ReceiptForm({ accountId, number, header, totals, donationCategories, donationsLoading, donationError, onRetryDonations, record: initial, page, onSaved, onBusyChange, allowEdit = false, onReadyChange, onDirtyChange, actions, messages }: {
  accountId: string; number: number; header: ReceiptHeader; totals: ReceiptTotals; record: ReceiptRecord | null; page: number;
  donationCategories: ReceiptDonationCategory[]; donationsLoading: boolean; donationError: unknown;
  onRetryDonations: () => void;
  onSaved: (book: ReceiptBook) => void; onBusyChange: (value: boolean) => void;
  allowEdit?: boolean; onReadyChange?: (ready: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  actions?: ReactNode; messages?: ReactNode;
}) {
  const { t, language } = useLanguage(); const [record, setRecord] = useState(initial);
  const [fields, setFields] = useState(() => { const draft = editor(initial?.values ?? newReceipt(number, header)); return { ...draft,
    heads: draft.heads.map((head) => ({ ...head, needsDetail: initial?.labels[head.headId]?.needsDetail ?? false })) }; });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  const [showCancellation, setShowCancellation] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const cancelled = record?.values.status === "CANCELLED" && record.checked && !allowEdit;
  const cancellationBlocked = record !== null && record.values.status !== "CANCELLED";
  const busy = saving; const locked = header.finalized && !allowEdit;
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  const field = <K extends keyof Editor>(key: K, value: Editor[K]) => setFields((current) => ({ ...current, [key]: value }));
  const chooseDonor = useCallback((value: DonorSuggestion) => setFields((current) => ({ ...current, ...value, email: current.email })), []);
  const { amount, heads, ...details } = fields;
  const values: ReceiptValues = { ...details, receiverName: header.returned.collectorName, amountPaise: parseMoney(amount), heads: heads.map((row) => ({ categoryId: row.categoryId, headId: row.headId, purpose: row.purpose, amountPaise: parseMoney(heads.length === 1 ? amount : row.amount) })) };
  const limitError = receiptLimitError(values, header, totals, record?.values);
  const available = Math.min(receiptRemaining(header, totals, record?.values, fields.paymentMode), receiptRemaining(header, totals, record?.values, "TOTAL"));
  const panInvalid = fields.pan !== "" && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(fields.pan);
  const ready = !limitError && !panInvalid && heads.length <= 1 && receiptComplete(values, header) && heads.every((row) => !row.needsDetail || row.purpose.trim());
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
  async function save(markChecked = false, nextValues = values) {
    if (busy || locked || cancelled) return; setError(null);
    if (nextValues.status === "CANCELLED" && cancellationBlocked) { setError("receiptCancelSavedBlocked"); return; }
    const exceeded = receiptLimitError(nextValues, header, totals, record?.values);
    if (exceeded) { setError(exceeded); return; }
    if (nextValues.heads.length > 1) { setError("receiptOneHeadHelp"); return; }
    const parsed = receiptValuesSchema.safeParse(nextValues);
    if (!parsed.success || (nextValues === values && ((amount !== "" && values.amountPaise === null) || heads.some((row) => row.amount !== "" && parseMoney(row.amount) === null)))) { setError("receiptInvalid"); return; }
    if (markChecked && !receiptComplete(parsed.data, header)) { setError("receiptIncomplete"); return; }
    setSaving(true); onBusyChange(true);
    try {
      const result = receiptBookResponseSchema.parse(await receiptRequest(`/api/v1/receipt-entry/${header.returned.id}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SAVE", number, version: record?.version ?? null, values: parsed.data, checked: markChecked, page }) }));
      const saved = result.data.rows.find((row) => row.number === number)?.record;
      if (saved) {
        setRecord(saved);
        if (nextValues !== values || RECEIPT_REASON_OPTIONS.some((option) => option.code === parsed.data.reasonId)) {
          const next = editor(saved.values);
          setFields({ ...next, heads: next.heads.map((row) => ({ ...row, needsDetail: saved.labels[row.headId]?.needsDetail ?? false })) });
          setShowCancellation(false);
        }
      }
      onSaved(result.data);
    } catch (failure) { setError(receiptError(failure)); } finally { setSaving(false); onBusyChange(false); }
  }
  function cancelReceipt() {
    if (cancellationBlocked) { setError("receiptCancelSavedBlocked"); return; }
    if (!cancelReason) return;
    void save(true, { ...values, status: "CANCELLED", reasonId: cancelReason,
      amountPaise: 0, amountWords: amountInWords(0), heads: [], paymentMode: "CASH",
      upiAppId: "", reference: "", transactionDate: "", chequeNumber: "", bankId: "", branch: "", chequeDate: "" });
  }
  const control = "w-full min-h-9 rounded-lg border border-border bg-card px-2.5 py-2 text-xs";
  const textField = (key: "donorName" | "parentName" | "village" | "postOffice" | "block" | "district" | "state" | "pin", label: MessageKey, required = false) =>
    <AuthField id={`receipt-${key}`} label={t(label)} required={required} maxLength={key === "pin" ? 6 : 120} value={fields[key]} onChange={(event) => field(key, key === "pin" ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)} />;
  return <form className="flex h-full min-h-0 flex-col [&_.field-label]:mb-1 [&_.field-label]:text-[11px] [&_.input]:min-h-9 [&_.input]:rounded-lg [&_.input]:px-2.5 [&_.input]:py-2 [&_.input]:text-xs [&_select]:min-h-9 [&_select]:text-xs [&_.field-hint]:text-[10px]" onSubmit={(event) => event.preventDefault()}>
    <div className="relative min-h-0 flex-1">
    <div className="h-full space-y-3 overflow-y-auto overscroll-contain p-1 pe-2 [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]">
    <fieldset disabled={busy || locked || cancelled} aria-hidden={cancelled || undefined} className={`m-0 min-w-0 border-0 p-0 disabled:opacity-90 ${cancelled ? "select-none blur-sm" : ""}`}>
      <div className="overflow-hidden rounded-2xl border-2 border-primary/30 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-primary/20 bg-accent/50 px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.2em] text-primary">{t("receiptEntry")}</p><h2 className="mt-1 text-xl font-bold text-primary">Jamia Al Habib</h2></div>
          <div className="text-end"><span className="text-xs text-muted-foreground">{t("receiptNumber")}</span><strong className="ms-2 text-2xl" dir="ltr">{number}</strong><div className="mt-1"><Badge tone={checked ? "success" : "warning"}>{t(checked ? "submissionChecked" : ready ? "receiptComplete" : "receiptIncompleteLabel")}</Badge></div></div></div>
        <div className="grid gap-4 border-b border-border p-4 sm:grid-cols-3"><div><label className="mb-1 block text-[11px] font-semibold" htmlFor="receipt-status">{t("status")}</label><select id="receipt-status" className={control} value={fields.status} onChange={(event) => {
          const status = event.target.value as ReceiptValues["status"];
          if (status === "CANCELLED" && cancellationBlocked) { setError("receiptCancelSavedBlocked"); return; }
          setFields((current) => ({ ...current, status, heads: status === "VALID" ? current.heads.length ? current.heads : [{ categoryId: "", headId: "", purpose: "", amount: "", needsDetail: false }] : [],
            amount: status === "VALID" && header.tokenValuePaise !== null ? inputMoney(header.tokenValuePaise) : status !== "VALID" && current.amount === "" ? "0" : current.amount }));
        }}>{(["VALID", "CANCELLED", "TORN", "LOST", "BLANK"] as const).map((status) => <option key={status} value={status} disabled={status === "CANCELLED" && cancellationBlocked}>{t(({ VALID: "receiptValid", CANCELLED: "returnsCancelled", TORN: "returnsTorn", LOST: "booksLost", BLANK: "receiptBlank" } as const)[status])}</option>)}</select></div>
          <AuthField id="receipt-date" label={t("date")} type="date" required min={header.assignmentDate} max={header.returned.returnDate} value={fields.date} onChange={(event) => field("date", event.target.value)} />
          <AuthField id="receipt-amount" label={t("receiptAmount")} type="number" min="0" max={available / 100} step="0.01" required value={amount} error={limitError ? t(limitError) : undefined} readOnly={fields.status === "VALID" && header.bookType === "TOKEN"} onChange={(event) => changeAmount(event.target.value)} /></div>
        {fields.status !== "VALID" && !cancelled ? <section className="space-y-4 p-5"><p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{t("receiptNonValidHelp")}</p>
          <ReceiptReasonSelect value={fields.reasonId} currentName={labelFor(fields.reasonId)} onChange={(value) => field("reasonId", value)} /></section>
          : <div className="grid lg:grid-cols-[minmax(260px,.8fr)_minmax(0,1.7fr)]">
            <section className="border-b border-border bg-muted/20 p-4 lg:border-e lg:border-b-0"><h3 className="mb-3 text-xs font-bold">{t("receiptHeads")}</h3>
              {donationError != null && <div className="mb-3 space-y-2"><p className="text-xs text-[var(--danger)]" role="alert">{t(receiptError(donationError))}</p><Button variant="outline" size="small" loading={donationsLoading} onClick={onRetryDonations}>{t("usersRefresh")}</Button></div>}
              {heads.length > 1 && <div className="mb-3 space-y-2 rounded-lg bg-[var(--warning-soft)] p-3 text-xs"><p>{t("receiptOneHeadHelp")}</p><Button variant="outline" size="small" onClick={() => field("heads", heads.slice(0, 1))}>{t("receiptUseOneHead")}</Button></div>}
              {heads.map((row, index) => <div key={index} className="space-y-2 border-b border-border py-3"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 [&>div]:min-w-0">
                <ReceiptOptionSelect label="receiptCategory" value={row.categoryId} currentName={labelFor(row.categoryId)} options={donationCategories} loading={donationsLoading} onChange={(categoryId) => head(index, { categoryId, headId: "", purpose: "", needsDetail: false })} />
                <ReceiptOptionSelect label="receiptHead" disabled={!row.categoryId} value={row.headId} currentName={labelFor(row.headId)} options={donationCategories.find((category) => category.id === row.categoryId)?.heads ?? []} loading={donationsLoading}
                  onChange={(headId) => head(index, { headId, needsDetail: donationCategories.find((category) => category.id === row.categoryId)?.heads.find((option) => option.id === headId)?.needsDetail ?? false })} />
                <div className="col-span-2"><AuthField id={`head-purpose-${index}`} label={t("receiptPurpose")} required={row.needsDetail} maxLength={300} value={row.purpose} onChange={(event) => head(index, { purpose: event.target.value })} /></div></div>
              </div>)}
              {!locked && !cancelled && <div className="mt-4 border-t border-dashed border-border pt-4">
                <Button variant="outline" size="small" className="w-full text-[var(--danger)] hover:bg-[var(--danger-soft)]" disabled={cancellationBlocked} aria-expanded={showCancellation && !cancellationBlocked} aria-controls={`receipt-cancel-${number}`} onClick={() => setShowCancellation((value) => !value)}>
                  <Ban size={14} aria-hidden="true" />{t("receiptCancel")}
                </Button>
                {cancellationBlocked && <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t("receiptCancelSavedBlocked")}</p>}
                {showCancellation && !cancellationBlocked && <div id={`receipt-cancel-${number}`} className="mt-3 space-y-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{t("receiptCancelHelp")}</p>
                  <ReceiptReasonSelect value={cancelReason} onChange={setCancelReason} />
                  <Button size="small" className="w-full bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90" loading={saving} disabled={busy || !cancelReason} onClick={cancelReceipt}>{t("receiptConfirmCancel")}</Button>
                </div>}
              </div>}
            </section>
            <section className="space-y-4 p-4"><label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-primary" checked={fields.anonymous} onChange={(event) => field("anonymous", event.target.checked)} />{t("receiptAnonymous")}</label>
              <div className="grid gap-3 sm:grid-cols-2">{textField("donorName", "receiptDonorName", !fields.anonymous)}<AuthField id="receipt-phone" label={t("usersMobile")} required={!fields.anonymous} inputMode="numeric" maxLength={10} value={fields.phone} onChange={(event) => field("phone", event.target.value.replace(/\D/g, "").slice(0, 10))} /></div>
              {!locked && !cancelled && <DonorLookup accountId={accountId} phone={fields.phone} name={fields.donorName} onChoose={chooseDonor} />}
              <div className="grid gap-3 sm:grid-cols-[100px_1fr]"><div><label className="mb-1 block text-[11px] font-semibold" htmlFor="receipt-parentage">{t("receiptParentage")}</label><select id="receipt-parentage" className={control} value={fields.parentage} onChange={(event) => field("parentage", event.target.value as ReceiptValues["parentage"])}><option value="S/O">S/o</option><option value="D/O">D/o</option><option value="W/O">W/o</option></select></div>{textField("parentName", "receiptParentName")}</div>
              <div className="grid gap-3 sm:grid-cols-3">{textField("village", "receiptVillage", true)}{textField("postOffice", "receiptPostOffice")}{textField("block", "receiptBlock")}{textField("district", "receiptDistrict")}{textField("state", "receiptState")}{textField("pin", "receiptPin")}</div>
              <AuthField id="receipt-pan" label={t("receiptPan")} maxLength={10} value={fields.pan} error={panInvalid ? t("receiptPanInvalid") : undefined} onChange={(event) => field("pan", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} />
              <AuthField id="receipt-words" label={t("receiptWords")} required maxLength={500} value={fields.amountWords} onChange={(event) => field("amountWords", event.target.value)} hint={t("receiptWordsHint")} />
              <div className="border-y border-border py-3"><label className="mb-1 block text-[11px] font-semibold" htmlFor="receipt-payment">{t("receiptPayment")}</label><select id="receipt-payment" className={control} value={fields.paymentMode} onChange={(event) => field("paymentMode", event.target.value as ReceiptValues["paymentMode"])}><option value="CASH">{t("receiptCash")}</option><option value="DIGITAL">{t("receiptDigital")}</option><option value="CHEQUE">{t("receiptCheque")}</option></select>
                <p className="mt-2 text-xs text-muted-foreground">{t("receiptRemainingAmount")}: <strong className="text-primary">{displayMoney(available, language)}</strong></p>
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
    {cancelled && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-card/50 p-6" role="status" aria-live="polite">
      <div className="max-w-full text-center">
        <p className="mb-6 text-xs font-semibold text-muted-foreground">{t("receiptNumber")} · {number}</p>
        <strong className="inline-block -rotate-12 rounded-xl border-4 border-[var(--danger)] px-6 py-3 text-4xl font-black uppercase tracking-widest text-[var(--danger)] sm:text-6xl">{t("returnsCancelled")}</strong>
        <p className="mt-8 text-sm font-semibold text-[var(--danger)]">{t("receiptCancelledSaved")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{labelFor(record?.values.reasonId ?? "")}</p>
      </div>
    </div>}
    </div>
    <div className="z-10 shrink-0 space-y-2 border-t border-border bg-card px-3 py-2.5 shadow-[0_-3px_12px_rgb(0_0_0/0.03)]">
      {error && <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]" role="alert">{t(error)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {actions}
        {!locked && !cancelled && <div className="ms-auto flex gap-2">{!header.finalized && <Button variant="outline" size="small" loading={saving} disabled={busy || Boolean(limitError) || panInvalid || heads.length > 1} onClick={() => { void save(); }}>{t("receiptSaveDraft")}</Button>}
          <Button size="small" loading={saving} disabled={busy || !ready || checked} onClick={() => { void save(true); }}>{t(header.finalized ? "submissionSaveCorrection" : "submissionMarkChecked")}</Button></div>}
      </div>
    </div>
  </form>;
}
