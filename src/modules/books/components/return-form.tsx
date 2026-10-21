"use client";
import { useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { booksError, booksRequest } from "@/modules/books/books.client";
import { indiaToday } from "@/modules/books/assignments.schema";
import { commissionPaise, displayMoney, parseMoney, returnSavedSchema } from "@/modules/books/returns.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { OpenReturnCase, ReturnRow, ReturnValues } from "@/modules/books/returns.schema";
import type { BookRow } from "@/modules/books/books.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function ReturnForm({ account, current, onBusyChange, onSaved }: { account: Account; current: OpenReturnCase;
  onBusyChange: (value: boolean) => void; onSaved: (row: ReturnRow, book: BookRow, replayed: boolean) => void }) {
  const { t, language } = useLanguage(); const operation = useRef({ id: "", values: "" });
  const [date, setDate] = useState(indiaToday); const [totalInput, setTotal] = useState("");
  const [cashInput, setCash] = useState(""); const [last, setLast] = useState("");
  const [given, setGiven] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  const total = parseMoney(totalInput); const cash = parseMoney(cashInput);
  const digital = total !== null && cash !== null && cash <= total ? total - cash : null;
  const lastUsed = last === "" ? null : Number(last); const from = current.book.receiptFrom; const to = current.book.receiptTo;
  const rangeValid = lastUsed === null || (Number.isInteger(lastUsed) && lastUsed >= from && lastUsed <= to);
  const used = lastUsed === null ? 0 : lastUsed - from + 1; const remaining = to - from + 1 - used;
  const basisPoints = current.commissionBasisPoints ?? 0; const commission = commissionPaise(total ?? 0, basisPoints);
  const valid = confirmed && total !== null && cash !== null && digital !== null && rangeValid
    && (total === 0 || used > 0) && date >= current.assignment.assignmentDate && date <= indiaToday();
  async function start() {
    if (!valid || busy) return; setBusy(true); onBusyChange(true); setError(null);
    const values: ReturnValues = { caseId: current.id, returnDate: date, totalPaise: total!, cashPaise: cash!, digitalPaise: digital!,
      receiptSumPaise: total!, receiptsUsed: used, lastUsed, commissionBasisPoints: basisPoints, commissionGiven: given,
      exceptions: [], remarks: "", outcome: remaining > 0 ? "PARTLY_USED" : "CLOSED", flagReasonId: null, expectedPaise: null, foundPaise: null };
    const serialized = JSON.stringify(values);
    if (operation.current.values !== serialized) operation.current = { id: crypto.randomUUID(), values: serialized };
    try {
      const result = returnSavedSchema.parse(await booksRequest("/api/v1/book-returns", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: operation.current.id, values }) }));
      onSaved(result.data.row, result.data.book, result.data.replayed);
    } catch (failure) { setError(booksError(failure)); } finally { setBusy(false); onBusyChange(false); }
  }
  return <form className="space-y-5 pt-4" onSubmit={(event) => { event.preventDefault(); void start(); }}><fieldset disabled={busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
    <ReturnAssignmentDetails current={current} />
    <div className="grid gap-4 sm:grid-cols-2"><AuthField id="submission-date" label={t("returnsDate")} type="date" required value={date} min={current.assignment.assignmentDate} max={indiaToday()} onChange={(event) => setDate(event.target.value)} />
      <AuthField id="submission-checker" label={t("returnsCheckedBy")} readOnly value={account.fullName} />
      <AuthField id="submission-total" label={t("returnsTotal")} type="number" min="0" step="0.01" required value={totalInput} onChange={(event) => setTotal(event.target.value)} />
      <AuthField id="submission-cash" label={t("returnsCash")} type="number" min="0" step="0.01" required value={cashInput} onChange={(event) => setCash(event.target.value)} error={cash !== null && total !== null && cash > total ? t("returnsCashMismatch") : undefined} />
      <AuthField id="submission-online" label={t("returnsDigital")} readOnly value={digital === null ? "" : (digital / 100).toFixed(2)} hint={t("submissionOnlineHelp")} />
      <AuthField id="submission-last" label={t("returnsLastUsed")} type="number" min={from} max={to} step="1" required={total !== null && total > 0} value={last} onChange={(event) => setLast(event.target.value)} hint={t("submissionLastHelp")} error={!rangeValid || (total !== null && total > 0 && lastUsed === null) ? t("returnsRangeInvalid") : undefined} />
      <AuthField id="submission-used" label={t("returnsUsed")} readOnly value={Math.max(0, used)} />
      <AuthField id="submission-unused" label={t("returnsRemaining")} readOnly value={Math.max(0, remaining)} />
    </div>
    <div className="grid gap-3 rounded-xl bg-accent p-4 sm:grid-cols-2">{([["returnsCommission", `${basisPoints / 100}%`], ["returnsCommissionAmount", displayMoney(commission, language)],
      ["returnsNet", displayMoney((total ?? 0) - commission, language)], [cash !== null && cash - commission < 0 ? "returnsPayable" : "returnsHandover", displayMoney(Math.abs((cash ?? 0) - commission), language)]] as [MessageKey, string][]).map(([label, value]) =>
      <div key={label}><span className="text-xs text-muted-foreground">{t(label)}</span><strong className="mt-1 block text-xl text-primary">{value}</strong></div>)}</div>
    {current.commissionBasisPoints === null && <p className="text-xs text-muted-foreground">{t("submissionNoCommission")}</p>}
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-primary" checked={given} onChange={(event) => setGiven(event.target.checked)} />{t("returnsCommissionGiven")}</label>
    <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{t("submissionDraftHelp")}</p>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{t(error)}</p>}
    <label htmlFor="submission-confirm" className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-xs leading-relaxed ${confirmed ? "border-border bg-muted/40" : "border-primary/40 bg-accent"}`}>
      <input id="submission-confirm" type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      <span id="submission-confirm-label">{t("submissionVerify")} <span className="font-bold text-[var(--danger)]" aria-hidden="true">*</span></span>
    </label>
    <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!valid} aria-describedby={!confirmed ? "submission-confirm-label" : undefined}>{t("submissionStart")}</Button></div>
  </fieldset></form>;
}
export function ReturnAssignmentDetails({ current }: { current: OpenReturnCase }) {
  const { t } = useLanguage(); const { assignment, book } = current;
  return <section className="rounded-xl border border-border bg-accent p-4"><div className="flex items-center gap-3"><div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card text-lg font-bold text-primary">
    {current.hasPhoto ? <img alt="" className="size-full object-cover" src={`/api/v1/people/${assignment.collectorId}/photo`} /> : assignment.collectorName.slice(0, 1)}</div>
    <div><strong className="block text-base">{assignment.collectorName}</strong><span className="text-xs text-muted-foreground">{assignment.collectorCode} · {assignment.phone}</span></div></div>
    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">{t("booksNumber")}</dt><dd className="mt-1 font-semibold">{book.bookNumber} · {current.sourceCode}</dd></div>
      <div><dt className="text-muted-foreground">{t("booksReceiptRange")}</dt><dd className="mt-1" dir="ltr">{book.receiptFrom}–{book.receiptTo}</dd></div>
      <div><dt className="text-muted-foreground">{t("assignNumber")}</dt><dd className="mt-1">{assignment.number}</dd></div>
      <div><dt className="text-muted-foreground">{t("assignDate")}</dt><dd className="mt-1">{assignment.assignmentDate}</dd></div></dl>
  </section>;
}
