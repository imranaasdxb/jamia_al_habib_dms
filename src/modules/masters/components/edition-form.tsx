"use client";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { editionInputSchema, editionLabel, editionQuantity } from "@/modules/masters/editions.schema";
import { masterDefaults, mastersError, mastersRequest } from "@/modules/masters/masters.client";
import { masterSaveResponseSchema } from "@/modules/masters/masters.schema";
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
  const edition = record?.edition;
  const { register, handleSubmit, watch, formState: { errors, isSubmitting, isValid, isDirty } } = useForm<EditionInput>({
    resolver: zodResolver(editionInputSchema), mode: "onChange", defaultValues: {
      editionNumber: edition ? editionLabel(Number(edition.editionNumber)) : "",
      bookType: edition?.bookType ?? "REGULAR", tokenTen: edition?.tokenTen ?? "0", tokenTwenty: edition?.tokenTwenty ?? "0", tokenFifty: edition?.tokenFifty ?? "0", printingYear: edition?.printingYear ?? String(new Date().getFullYear()),
      editionCode: edition?.editionCode ?? record?.code ?? "", pagesFrom: edition?.pagesFrom ?? "",
      pagesTo: edition?.pagesTo ?? "", designedPrintedBy: edition?.designedPrintedBy ?? "",
    },
  });
  const quantity = editionQuantity(watch("pagesFrom"), watch("pagesTo"));
  const invalid = (name: keyof EditionInput) => errors[name] ? t(name === "pagesTo" ? "editionRangeHelp" : name === "tokenFifty" ? "editionTokenRequired" : "mastersInvalidField") : undefined;

  async function save(input: EditionInput) {
    const quantity = editionQuantity(input.pagesFrom, input.pagesTo);
    if (quantity === null || (record && reason.trim().length < 3)) return;
    setError(null); onBusyChange(true);
    try {
      const result = masterSaveResponseSchema.parse(await mastersRequest(record ? `/api/v1/masters/${record.id}` : "/api/v1/masters", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "EDITION", version: record?.updatedAt, reason,
          values: { ...masterDefaults("EDITION"), code: input.editionCode, nameEn: editionLabel(Number(input.editionNumber)),
            nameUr: `ایڈیشن ${Number(input.editionNumber)}`, active, notes: record?.notes ?? "",
            edition: { ...input, tokenTen: input.bookType === "TOKEN" ? input.tokenTen : "0", tokenTwenty: input.bookType === "TOKEN" ? input.tokenTwenty : "0", tokenFifty: input.bookType === "TOKEN" ? input.tokenFifty : "0", pagesPerBook: 50, quantity } } }),
      }));
      onSaved(result.data);
    } catch (failure) { setError(mastersError(failure)); }
    finally { onBusyChange(false); }
  }

  return <form noValidate onSubmit={handleSubmit(save)} className="mt-4 space-y-4 [&_.field-label]:mb-1.5 [&_.input]:min-h-10 [&_.input]:px-3 [&_.input]:py-2 [&_.input]:text-sm">
    {record && !edition && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("editionLegacyHelp")}</p>}
    <fieldset disabled={isSubmitting} className="m-0 grid min-w-0 grid-cols-1 gap-3.5 border-0 p-0 sm:grid-cols-2">
      <div><AuthField id="edition-number" label={t("editionNumber")} required list={listId} maxLength={24}
        placeholder="1st edition" error={invalid("editionNumber")} {...register("editionNumber")} />
        <datalist id={listId}>{Array.from({ length: 20 }, (_, index) => <option key={index} value={editionLabel(index + 1)} />)}</datalist>
      </div>
      <div><label htmlFor="edition-book-type" className="mb-1.5 block text-xs font-semibold">{t("editionBookType")} *</label>
        <select id="edition-book-type" required className="min-h-10 w-full rounded-[var(--radius-control)] border border-[var(--input)] bg-card px-3 py-2 text-sm" {...register("bookType")}>
          <option value="REGULAR">{t("editionGeneral")}</option><option value="TOKEN">{t("editionToken")}</option>
        </select>
      </div>
      <AuthField id="edition-year" label={t("editionPrintingYear")} required type="number" min={1900} max={2100} step={1} error={invalid("printingYear")} {...register("printingYear")} />
      <AuthField id="edition-code" label={t("editionCode")} required maxLength={40} readOnly={Boolean(record)} error={invalid("editionCode")} {...register("editionCode")} />
      <AuthField id="edition-pages-from" label={t("editionPagesFrom")} required type="number" min={1} max={2147483647} step={1} error={invalid("pagesFrom")} {...register("pagesFrom")} />
      <AuthField id="edition-pages-to" label={t("editionPagesTo")} required type="number" min={1} max={2147483647} step={1} error={invalid("pagesTo")} {...register("pagesTo")} />
      <AuthField id="edition-pages-per-book" label={t("editionPagesPerBook")} value={50} readOnly />
      <AuthField id="edition-quantity" label={t("editionQuantity")} value={quantity ?? "—"} readOnly />
      <AuthField id="edition-printer" label={t("editionPrinter")} required maxLength={160} error={invalid("designedPrintedBy")} {...register("designedPrintedBy")} />
      <div className="flex items-center gap-2 self-end rounded-[var(--radius-control)] border border-border bg-muted/40 px-3 py-2.5">
        <input id="edition-active" type="checkbox" className="accent-primary" checked={active} onChange={(event) => setActive(event.target.checked)} />
        <label htmlFor="edition-active" className="text-sm">{t("usersActive")}</label>
      </div>
      {record && <div className="sm:col-span-2"><AuthField id="edition-reason" label={t("settingsReason")} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></div>}
    </fieldset>
    {watch("bookType") === "TOKEN" && <fieldset disabled={isSubmitting} className="m-0 grid min-w-0 grid-cols-1 gap-3.5 rounded-lg border border-border p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs font-semibold">{t("editionTokenDistribution")}</legend>
      {([["tokenTen", 10], ["tokenTwenty", 20], ["tokenFifty", 50]] as const).map(([name, value]) =>
        <AuthField key={name} id={`edition-${name}`} label={`₹${value} · ${t("editionQuantity")}`} required type="number" min={0} max={quantity ?? 0} step={1}
          error={invalid(name)} {...register(name)} />)}
      <p className="self-center text-xs leading-relaxed text-muted-foreground">{t("editionTokenRequired")}</p>
    </fieldset>}
    <p className="text-xs leading-relaxed text-muted-foreground">{t("editionRangeHelp")}</p>
    {error && <p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{t(error)}</p>}
    <div className="flex justify-end border-t border-border pt-3"><Button type="submit" loading={isSubmitting}
      disabled={!isValid || Boolean(record && ((!isDirty && active === record.active) || reason.trim().length < 3))}>{t(isSubmitting ? "usersSaving" : "mastersSave")}</Button></div>
  </form>;
}
