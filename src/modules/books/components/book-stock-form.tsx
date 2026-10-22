"use client";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLanguage } from "@/components/language-provider";
import { usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { BookMasterSelect } from "@/modules/books/components/book-master-select";
import { BookRequestError, bookDefaults, booksError, booksRequest } from "@/modules/books/books.client";
import { bookEntryResponseSchema, booksSavedSchema, bulkBookRows, stockEditorSchema, stockSubmission } from "@/modules/books/books.schema";
import { formatCurrency } from "@/lib/utils";
import type { Account } from "@/modules/auth/auth.types";
import type { BookRow, SingleBookValues, StockEditorValues } from "@/modules/books/books.schema";
import type { MessageKey } from "@/lib/i18n/messages";

const BulkPreview = memo(function BulkPreview({ rows }: { rows: SingleBookValues[] }) {
  const { t } = useLanguage();
  return <div className={"books-preview [&_.books-table_:is(th,_td)]:p-[15px_16px] [&_.books-table_:is(th,_td)]:text-start [&_.books-table_:is(th,_td)]:align-middle [&_.books-table_:is(th,_td)]:[overflow-wrap:anywhere] [&_.books-table_:is(th,_td):first-child]:ps-[20px] [&_.books-table_:is(th,_td):last-child]:pe-[20px] [&_h3]:text-[length:13px] [&_h3]:mb-[14px] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]"}><h3>{t("booksPreview")} · {rows.length}</h3><div className={"books-preview-scroll max-h-[320px] overflow-auto [border:1px_solid_var(--border)] rounded-[var(--radius)] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}><table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end books-table [&_thead_th]:bg-[var(--muted)] [&_thead_th]:font-semibold [&_thead_th]:text-[length:11px] [&_tbody_td]:text-[length:12px] [&_tbody_td]:leading-[1.6]"}>
    <thead><tr><th scope="col">{t("booksNumber")}</th><th scope="col">{t("booksReceiptFrom")}</th><th scope="col">{t("booksReceiptTo")}</th>
      <th scope="col">{t("booksTotalReceipts")}</th><th scope="col">{t("booksFaceValue")}</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.bookNumber}><td><bdi>{row.bookNumber}</bdi></td><td>{row.receiptFrom}</td><td>{row.receiptTo}</td>
      <td>{Number(row.receiptTo) - Number(row.receiptFrom) + 1}</td><td>{row.bookType === "TOKEN" ? formatCurrency((Number(row.receiptTo) - Number(row.receiptFrom) + 1) * Number(row.tokenValue)) : "—"}</td></tr>)}</tbody>
  </table></div></div>;
});
export function BookStockForm({ account, mode, onBusyChange, onSaved }: {
  account: Account; mode: "SINGLE" | "BULK"; onBusyChange: (busy: boolean) => void; onSaved: (rows: BookRow[], replayed: boolean) => void;
}) {
  const { t } = useLanguage();
  const schema = useMemo(() => stockEditorSchema(mode), [mode]);
  const operationId = useRef<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<{ source: string; rows: SingleBookValues[] } | null>(null);
  const [stockPage, setStockPage] = useState(1);
  const loadStock = useCallback(async () => bookEntryResponseSchema.parse(
    await booksRequest(`/api/v1/books/entry-context?page=${stockPage}`)).data, [stockPage]);
  const stock = usePageQuery(`${account.id}:books:entry-context:${stockPage}`, loadStock);
  const stockLoading = (stock.loading || stock.stale) && !stock.data;
  const nextReceipt = stock.data?.nextReceipt;
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting, isValid } } = useForm<StockEditorValues>({
    resolver: zodResolver(schema), mode: "onChange", defaultValues: { ...bookDefaults(),
      startingBookNumber: "", bookCount: "100", receiptsPerBook: "100", firstReceipt: "" },
  });
  const values = watch();
  const parsed = schema.safeParse(values);
  const draft = parsed.success ? stockSubmission(mode, "", parsed.data) : null;
  const source = draft ? JSON.stringify(draft.values) : "";
  const previewValid = Boolean(preview && source && preview.source === source);
  const receiptCount = Number(values.receiptTo) - Number(values.receiptFrom) + 1;
  const validCount = /^\d+$/.test(values.receiptFrom) && /^\d+$/.test(values.receiptTo)
    && Number(values.receiptFrom) >= 1 && Number(values.receiptTo) <= 2147483647 && receiptCount > 0;
  function field(name: keyof StockEditorValues, label: MessageKey, type = "text", extra: { maxLength?: number; min?: number; max?: number; placeholder?: string } = {}) {
    return <AuthField id={`stock-${name}`} key={name} label={t(label)} type={type} required {...extra}
      error={errors[name] ? t("booksInvalidField") : undefined} {...register(name)} />;
  }
  async function save(input: StockEditorValues) {
    if (mode === "BULK" && !previewValid) return;
    setError(null); onBusyChange(true);
    try {
      operationId.current ??= crypto.randomUUID();
      const result = booksSavedSchema.parse(await booksRequest("/api/v1/books", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockSubmission(mode, operationId.current, input)) }));
      onSaved(result.data.rows, result.data.replayed);
    } catch (error) { setError(error); }
    finally { onBusyChange(false); }
  }
  return <form className="auth-form books-stock-form mt-4 flex min-w-0 flex-col gap-5" noValidate onSubmit={handleSubmit(save)}>
    <section aria-label={t("booksExistingStock")} aria-busy={stockLoading}
      className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">{t("booksExistingStock")}</h3>
        {(stockPage > 1 || stock.data?.hasMore) && <div className="flex items-center gap-1">
          <Button variant="ghost" size="small" disabled={stockLoading || isSubmitting || stockPage === 1}
            onClick={() => setStockPage((page) => page - 1)}>{t("usersPrevious")}</Button>
          <Button variant="ghost" size="small" disabled={stockLoading || isSubmitting || !stock.data?.hasMore}
            onClick={() => setStockPage((page) => page + 1)}>{t("usersNext")}</Button>
        </div>}
      </div>
      {stockLoading && <div className="flex gap-2 overflow-hidden" role="status" aria-label={t("working")}>
        {[0, 1, 2].map((item) => <div key={item} className="h-14 min-w-36 flex-1 animate-pulse rounded-lg bg-[var(--primary-soft)] motion-reduce:animate-none" />)}
      </div>}
      {stock.error != null && <p className="text-xs text-[var(--danger)]" role="alert">{t(booksError(stock.error))}</p>}
      {stock.data && <>
        <div tabIndex={0} aria-label={t("booksExistingStock")} className="flex flex-nowrap gap-2 overflow-x-auto overflow-y-hidden p-0.5 pb-2 [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]">
          {stock.data.rows.map((book) => <div key={book.id} className={`relative min-w-36 shrink-0 whitespace-nowrap rounded-lg border px-3 pb-2 pt-4 ${book.id === stock.data.latestId
            ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
            : "border-[var(--border)] bg-[var(--card)]"}`}>
            <bdi className="block text-xs font-semibold">{book.bookNumber}</bdi>
            {book.id === stock.data.latestId && <span className="absolute end-1 top-0.5 rounded-full bg-[var(--primary)] px-1.5 text-[8px] leading-3 text-[var(--primary-foreground)]">{t("booksLatestAdded")}</span>}
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]" aria-label={`${t("booksReceiptFrom")} ${book.receiptFrom}, ${t("booksReceiptTo")} ${book.receiptTo}`}>
              {t("booksReceiptFrom")} <bdi>{book.receiptFrom} – {book.receiptTo}</bdi>
            </p>
          </div>)}
        </div>
        {stock.data.rows.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">{t("booksNoStock")}</p>}
      </>}
    </section>
    <fieldset disabled={isSubmitting} className="m-0 grid min-w-0 gap-5 border-0 p-0 [&_textarea]:resize-y [&_textarea]:[font:inherit]">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {field("stockDate", "booksStockDate", "date")}
      <AuthField id="stock-entry-by" label={t("booksEntryBy")} value={account.fullName} readOnly />
      <BookMasterSelect accountId={account.id} kind="EDITION" label="mastersEditions" required searchable value={values.editionId}
        error={Boolean(errors.editionId)} onChange={(value) => setValue("editionId", value, { shouldDirty: true, shouldValidate: true })} />
      <BookMasterSelect accountId={account.id} kind="BOOK_TYPE" label="mastersBookTypes" required value={values.bookType}
        error={Boolean(errors.bookType)} onChange={(value) => {
          if (value !== "REGULAR" && value !== "TOKEN") return;
          setValue("bookType", value, { shouldDirty: true, shouldValidate: true });
          setValue("tokenValue", "", { shouldDirty: true, shouldValidate: true });
        }} />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {mode === "SINGLE" ? field("bookNumber", "booksNumber", "text", { maxLength: 40 })
        : field("startingBookNumber", "booksStartingNumber", "text", { maxLength: 20 })}
      {mode === "BULK" ? field("bookCount", "booksBookCount", "number", { min: 1, max: 150 })
        : values.bookType === "TOKEN" ? <BookMasterSelect accountId={account.id} kind="TOKEN_VALUE" label="mastersTokenValues" required value={values.tokenValue}
        error={Boolean(errors.tokenValue)} onChange={(value) => {
          if (value === "" || value === "10" || value === "20" || value === "50") setValue("tokenValue", value, { shouldDirty: true, shouldValidate: true });
        }} /> : <AuthField id="stock-total" label={t("booksTotalReceipts")} value={validCount ? receiptCount : "—"} readOnly />}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
        <div className="min-w-0">
          {field(mode === "SINGLE" ? "receiptFrom" : "firstReceipt", mode === "SINGLE" ? "booksReceiptFrom" : "booksFirstReceipt", "number",
            { min: 1, max: 2147483647, placeholder: nextReceipt != null ? String(nextReceipt) : undefined })}
          {nextReceipt != null && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span>{t("booksSuggestedStart")}: <bdi className="font-semibold text-[var(--primary)]">{nextReceipt}</bdi></span>
            <button type="button" className="rounded px-1 py-0.5 font-semibold text-[var(--primary)] hover:underline disabled:opacity-50"
              onClick={() => setValue(mode === "SINGLE" ? "receiptFrom" : "firstReceipt", String(nextReceipt), { shouldDirty: true, shouldValidate: true })}>
              {t("booksUseSuggested")}
            </button>
          </div>}
        </div>
        {mode === "SINGLE" ? field("receiptTo", "booksReceiptTo", "number", { min: 1, max: 2147483647 })
          : field("receiptsPerBook", "booksReceiptsPerBook", "number", { min: 1, max: 2147483647 })}
      </div>
      {mode === "BULK" && values.bookType === "TOKEN" && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <BookMasterSelect accountId={account.id} kind="TOKEN_VALUE" label="mastersTokenValues" required value={values.tokenValue}
          error={Boolean(errors.tokenValue)} onChange={(value) => {
            if (value === "" || value === "10" || value === "20" || value === "50") setValue("tokenValue", value, { shouldDirty: true, shouldValidate: true });
          }} />
      </div>}
    {mode === "SINGLE" && values.bookType === "TOKEN" && <div className={"books-calculated grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[18px] p-[20px] bg-[var(--primary-soft)] [border:1px_solid_var(--border)] rounded-[var(--radius)] [&_>_div]:grid [&_>_div]:gap-[8px] [&_span]:text-[length:11px] [&_span]:text-[color:var(--muted-foreground)] [&_strong]:text-[length:22px] [&_strong]:text-[color:var(--primary)]"}><div><span>{t("booksTotalReceipts")}</span><strong>{validCount ? receiptCount : "—"}</strong></div>
      <div><span>{t("booksFaceValue")}</span><strong>{validCount && values.bookType === "TOKEN" && values.tokenValue ? formatCurrency(receiptCount * Number(values.tokenValue)) : "—"}</strong></div></div>}
    <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="stock-remarks">{t("usersRemarks")}</label><textarea id="stock-remarks" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} rows={3} maxLength={1000} {...register("remarks")} /></div>
    </fieldset>
    {mode === "BULK" && <><p className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"}>{t("booksBulkHelp")}</p>
      <Button variant="outline" disabled={isSubmitting || !isValid} onClick={() => {
        if (!draft || draft.mode !== "BULK") return;
        setPreview({ source, rows: bulkBookRows(draft.values) }); setError(null);
      }}>{t("booksGeneratePreview")}</Button>
      {preview && previewValid && <BulkPreview rows={preview.rows} />}
      {preview && !previewValid && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"} role="status">{t("booksPreviewChanged")}</p>}</>}
    {error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(booksError(error))}
      {error instanceof BookRequestError && error.bookNumber && <> <strong dir="ltr">{error.bookNumber}</strong></>}</p>}
    <div className={"books-form-footer flex justify-end pt-[20px] [border-top:1px_solid_var(--border)]"}><Button type="submit" loading={isSubmitting} disabled={!isValid || (mode === "BULK" && !previewValid)}>
      {t(isSubmitting ? "usersSaving" : mode === "BULK" ? "booksSaveBulk" : "booksSave")}</Button></div>
  </form>;
}
