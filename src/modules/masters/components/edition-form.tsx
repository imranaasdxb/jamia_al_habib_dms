"use client";
import { useEffect, useId, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { editionInputSchema, editionLabel, editionQuantity } from "@/modules/masters/editions.schema";
import { masterDefaults, mastersError, mastersRequest } from "@/modules/masters/masters.client";
import { masterSaveResponseSchema } from "@/modules/masters/masters.schema";
import { EditionReceiptImage } from "@/modules/masters/components/edition-receipt-image";
import type { EditionInput } from "@/modules/masters/editions.schema";
import type { MasterRow } from "@/modules/masters/masters.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function EditionForm({ record, onBusyChange, onSaved }: {
  record?: MasterRow; onBusyChange: (busy: boolean) => void; onSaved: (record: MasterRow) => void;
}) {
  const { t } = useLanguage(); const listId = useId();
  const [active, setActive] = useState(record?.active ?? true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const photoId = useId(); const [photo, setPhoto] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const savedPhoto = record?.hasReceiptSample ? `/api/v1/masters/${record.id}/receipt-sample?v=${encodeURIComponent(record.updatedAt)}` : null;
  const [preview, setPreview] = useState<string | null>(savedPhoto);
  useEffect(() => {
    if (!photo) { setPreview(savedPhoto); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo, savedPhoto]);
  function choosePhoto(file: File) {
    if (file.size === 0 || file.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("editionReceiptInvalid"); return;
    }
    setError(null); setPhoto(file);
  }
  const edition = record?.edition;
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting, isValid, isDirty } } = useForm<EditionInput>({
    resolver: zodResolver(editionInputSchema), mode: "onChange", defaultValues: {
      editionNumber: edition ? editionLabel(Number(edition.editionNumber)) : "",
      bookType: edition?.bookType ?? "REGULAR", tokenValue: edition?.tokenValue ?? "",
      printingYear: edition?.printingYear ?? String(new Date().getFullYear()),
      editionCode: edition?.editionCode ?? record?.code ?? "", pagesFrom: edition?.pagesFrom ?? "",
      pagesTo: edition?.pagesTo ?? "", designedPrintedBy: edition?.designedPrintedBy ?? "",
    },
  });
  const bookType = watch("bookType");
  useEffect(() => {
    if (bookType === "TOKEN" && !record) setValue("pagesFrom", "1", { shouldValidate: true, shouldDirty: true });
    if (bookType === "REGULAR") setValue("tokenValue", "", { shouldValidate: true });
  }, [bookType, record, setValue]);
  const quantity = editionQuantity(watch("pagesFrom"), watch("pagesTo"));
  const invalid = (name: keyof EditionInput) => errors[name] ? t(name === "pagesTo" ? "editionRangeHelp" : name === "tokenValue" ? "editionTokenRequired" : "mastersInvalidField") : undefined;
  async function save(input: EditionInput) {
    const quantity = editionQuantity(input.pagesFrom, input.pagesTo);
    if (quantity === null || (record && reason.trim().length < 3)) return;
    setError(null); onBusyChange(true);
    try {
      const payload = { kind: "EDITION", version: record?.updatedAt, reason,
        values: { ...masterDefaults("EDITION"), code: input.editionCode, nameEn: editionLabel(Number(input.editionNumber)),
          nameUr: `ایڈیشن ${Number(input.editionNumber)}`, active, notes: record?.notes ?? "",
          edition: { ...input, tokenValue: input.bookType === "TOKEN" ? input.tokenValue : "", pagesPerBook: 50, quantity } } };
      const body = photo ? new FormData() : JSON.stringify(payload);
      if (body instanceof FormData && photo) { body.set("payload", JSON.stringify(payload)); body.set("receiptSample", photo); }
      const result = masterSaveResponseSchema.parse(await mastersRequest(record ? `/api/v1/masters/${record.id}` : "/api/v1/masters", {
        method: "POST", headers: photo ? undefined : { "Content-Type": "application/json" }, body,
      }));
      onSaved(result.data);
    } catch (failure) { setError(mastersError(failure)); }
    finally { onBusyChange(false); }
  }
  return <form noValidate onSubmit={handleSubmit(save)} className="mt-4 space-y-4 [&_.field-label]:mb-1.5 [&_.input]:min-h-10 [&_.input]:px-3 [&_.input]:py-2 [&_.input]:text-sm">
    {record && !edition && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("editionLegacyHelp")}</p>}
    <fieldset disabled={isSubmitting} className="m-0 grid min-w-0 grid-cols-1 gap-3.5 border-0 p-0 sm:grid-cols-2">
      <div><label htmlFor="edition-book-type" className="mb-1.5 block text-xs font-semibold">{t("editionBookType")} *</label>
        <select id="edition-book-type" required className="min-h-10 w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-card px-3 py-2 text-sm" {...register("bookType")}>
          <option value="REGULAR">{t("editionGeneral")}</option><option value="TOKEN">{t("editionToken")}</option>
        </select>
      </div>
      {bookType === "TOKEN" && <div><label htmlFor="edition-token-value" className="mb-1.5 block text-xs font-semibold">{t("mastersTokenValues")} *</label>
        <select id="edition-token-value" required aria-invalid={Boolean(errors.tokenValue)} className="min-h-10 w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-card px-3 py-2 text-sm" {...register("tokenValue")}>
          <option value="">{t("booksChooseOption")}</option>{["10", "50", "100"].map((value) => <option key={value} value={value}>₹{value}</option>)}
        </select>
        {errors.tokenValue && <p className="mt-1 text-xs text-[var(--danger)]">{t("editionTokenRequired")}</p>}
      </div>}
      <div><AuthField id="edition-number" label={t("editionNumber")} required list={listId} maxLength={24}
        placeholder="1st edition" error={invalid("editionNumber")} {...register("editionNumber")} />
        <datalist id={listId}>{Array.from({ length: 20 }, (_, index) => <option key={index} value={editionLabel(index + 1)} />)}</datalist>
      </div>
      <AuthField id="edition-year" label={t("editionPrintingYear")} required type="number" min={1900} max={2100} step={1} error={invalid("printingYear")} {...register("printingYear")} />
      <AuthField id="edition-code" label={t("editionCode")} required maxLength={40} readOnly={Boolean(record)} error={invalid("editionCode")} {...register("editionCode")} />
      <AuthField id="edition-pages-from" label={t("editionPagesFrom")} required type="number" min={1} max={2147483647} step={1} readOnly={bookType === "TOKEN"} error={invalid("pagesFrom")} {...register("pagesFrom")} />
      <AuthField id="edition-pages-to" label={t("editionPagesTo")} required type="number" min={1} max={2147483647} step={1} error={invalid("pagesTo")} {...register("pagesTo")} />
      <AuthField id="edition-pages-per-book" label={t("editionPagesPerBook")} value={50} readOnly />
      <AuthField id="edition-quantity" label={t("editionQuantity")} value={quantity ?? "—"} readOnly />
      <AuthField id="edition-printer" label={t("editionPrinter")} required maxLength={160} error={invalid("designedPrintedBy")} {...register("designedPrintedBy")} />
      <div className="flex items-center gap-2 self-end rounded-[var(--radius-control)] border border-border bg-muted/40 px-3 py-2.5">
        <input id="edition-active" type="checkbox" className="accent-primary" checked={active} onChange={(event) => setActive(event.target.checked)} />
        <label htmlFor="edition-active" className="text-sm">{t("usersActive")}</label>
      </div>
      <div className="min-w-0 space-y-2 sm:col-span-2">
        <span className="block text-xs font-semibold">{t("editionReceiptSample")}</span>
        <label htmlFor={photoId} data-dragging={dragging || undefined}
          className="relative flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 p-3 transition-colors hover:border-primary hover:bg-[var(--primary-soft)] focus-within:ring-2 focus-within:ring-primary data-[dragging=true]:border-primary data-[dragging=true]:bg-[var(--primary-soft)]"
          onDragOver={(event) => { event.preventDefault(); if (!isSubmitting) setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={(event) => {
            event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0];
            if (!isSubmitting && file) choosePhoto(file);
          }}>
          <input id={photoId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
            const file = event.target.files?.[0]; if (file) choosePhoto(file); event.target.value = "";
          }} />
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"><UploadCloud size={20} aria-hidden="true" /></span>
          <span className="min-w-0"><strong className="block text-xs text-primary">{t(photo || record?.hasReceiptSample ? "editionReceiptReplace" : "editionReceiptChoose")}</strong>
            <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{t("editionReceiptHint")}</span>
            {photo && <span className="mt-1 block truncate text-[11px]">{photo.name}</span>}
          </span>
        </label>
        {preview && <EditionReceiptImage source={preview} compact />}
        {photo && <Button variant="ghost" size="small" onClick={() => { setPhoto(null); setError(null); }}>{t("editionReceiptDiscard")}</Button>}
      </div>
      {record && <div className="sm:col-span-2"><AuthField id="edition-reason" label={t("settingsReason")} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></div>}
    </fieldset>
    <p className="text-xs leading-relaxed text-muted-foreground">{t(bookType === "TOKEN" ? "editionTokenHelp" : "editionRangeHelp")}</p>
    {error && <p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{t(error)}</p>}
    <div className="flex justify-end border-t border-border pt-3"><Button type="submit" loading={isSubmitting}
      disabled={!isValid || Boolean(record && ((!isDirty && active === record.active && !photo) || reason.trim().length < 3))}>{t(isSubmitting ? "usersSaving" : "mastersSave")}</Button></div>
  </form>;
}
