"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { MasterParentSelect } from "@/modules/masters/components/master-parent-select";
import { masterDefaults, masterLevelLabels, mastersError, mastersRequest } from "@/modules/masters/masters.client";
import { masterEditorSchema, masterSaveResponseSchema, masterValuesSchema } from "@/modules/masters/masters.schema";
import type { MasterKind, MasterRow, MasterValues } from "@/modules/masters/masters.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function MasterForm({ accountId, kind, record, onBusyChange, onSaved }: {
  accountId: string; kind: MasterKind; record?: MasterRow; onBusyChange: (busy: boolean) => void; onSaved: (record: MasterRow) => void;
}) {
  const { t, language } = useLanguage();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting, isDirty, isValid } } = useForm<MasterValues>({
    resolver: zodResolver(masterEditorSchema(kind)), mode: "onChange",
    defaultValues: record ? masterValuesSchema.strip().parse(record) : masterDefaults(kind),
  });
  const level = watch("level");
  const parentId = watch("parentId");
  async function submit(values: MasterValues) {
    if (record && reason.trim().length < 3) return;
    setError(null); onBusyChange(true);
    try {
      const result = masterSaveResponseSchema.parse(await mastersRequest(record ? `/api/v1/masters/${record.id}` : "/api/v1/masters", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, values, version: record?.updatedAt, reason }),
      }));
      onSaved(result.data);
    } catch (error) { setError(mastersError(error)); }
    finally { onBusyChange(false); }
  }
  return <form className={"auth-form flex flex-col gap-[19px] mt-[25px] masters-form mt-[24px] [&_textarea]:[font:inherit] [&_textarea]:[resize:vertical] [&_input[lang='ur']]:[font-family:var(--font-urdu),_serif]"} noValidate onSubmit={handleSubmit(submit)}>
    <fieldset disabled={isSubmitting} className={"masters-fields [border:0] p-0 m-0 min-w-0 grid gap-[22px]"}>
      <div className={"masters-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[22px] max-[700px]:grid-cols-[1fr]"}><AuthField id="master-code" label={t("mastersCode")} required maxLength={40}
        readOnly={Boolean(record)} hint={t("mastersCodeHint")} error={errors.code ? t("mastersInvalidField") : undefined} {...register("code")} />
        <div className={"masters-active flex flex-col"}><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="master-active">{t("status")}</label>
          <label className={"masters-checkbox inline-flex items-center gap-[9px] min-h-[38px] text-[length:12px] [&_input]:[accent-color:var(--primary)]"}><input id="master-active" type="checkbox" {...register("active")} />{t("usersActive")}</label></div>
        <AuthField id="master-name-en" label={t("mastersNameEn")} required maxLength={120} dir="ltr"
          error={errors.nameEn ? t("mastersInvalidField") : undefined} {...register("nameEn")} />
        <AuthField id="master-name-ur" label={t("mastersNameUr")} required maxLength={120} dir="rtl" lang="ur"
          error={errors.nameUr ? t("mastersInvalidField") : undefined} {...register("nameUr")} />
        {kind === "EDITION" && <AuthField id="master-effective" label={t("mastersEffective")} type="date" required
          error={errors.effectiveFrom ? t("mastersInvalidField") : undefined} {...register("effectiveFrom")} />}
        {kind === "TOKEN_VALUE" && <AuthField id="master-token" label={t("mastersTokenRupees")} readOnly {...register("tokenValue")} />}
        {kind === "AREA" && <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="master-area-level">{t("mastersAreaLevel")} *</label>
          {record ? <><input id="master-area-level" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} readOnly value={level ? t(masterLevelLabels[level]) : ""} />
            <input type="hidden" {...register("level")} /></> : <select id="master-area-level" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("level")}
              onChange={(event) => {
                void register("level").onChange(event);
                setValue("parentId", "", { shouldDirty: true, shouldValidate: true });
              }}>{(Object.keys(masterLevelLabels) as Exclude<MasterValues["level"], "">[]).map((value) =>
                <option key={value} value={value}>{t(masterLevelLabels[value])}</option>)}</select>}</div>}
        {(kind === "DONATION_HEAD" || kind === "BANK_ACCOUNT" || (kind === "AREA" && level !== "STATE" && level !== "")) && <MasterParentSelect
          key={`${kind}:${level}`} accountId={accountId} bank={kind === "BANK_ACCOUNT"} donation={kind === "DONATION_HEAD"} level={level} value={parentId}
          currentName={language === "ur" ? record?.parentNameUr ?? "" : record?.parentNameEn ?? ""}
          error={Boolean(errors.parentId)} onChange={(value) => setValue("parentId", value, { shouldDirty: true, shouldValidate: true })} />}
        {kind === "BANK_ACCOUNT" && <>
          <AuthField id="master-account-name" label={t("mastersAccountName")} required maxLength={120}
            error={errors.accountName ? t("mastersInvalidField") : undefined} {...register("accountName")} />
          <AuthField id="master-last-four" label={t("mastersLastFour")} required inputMode="numeric" maxLength={4}
            hint={t("mastersLastFourHint")} error={errors.lastFour ? t("mastersInvalidField") : undefined} {...register("lastFour")} />
          <AuthField id="master-upi-id" label={t("mastersUpiId")} maxLength={200} dir="ltr"
            error={errors.upiId ? t("mastersInvalidField") : undefined} {...register("upiId")} />
        </>}
      </div>
      {["DONATION_HEAD", "UPI_APP", "RECEIPT_REASON", "FLAG_REASON"].includes(kind) && <label className={"masters-checkbox inline-flex items-center gap-[9px] min-h-[38px] text-[length:12px] [&_input]:[accent-color:var(--primary)]"}>
        <input type="checkbox" disabled={kind === "DONATION_HEAD" && ["OTHER_OBLIGATORY", "OTHER_VOLUNTARY", "OTHER_SPECIFIED"].includes(record?.code ?? "")}
          {...register("needsDetail")} />{t("mastersNeedsDetail")}</label>}
      <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="master-notes">{t(kind === "EDITION" ? "mastersDesignNotes" : "usersRemarks")}</label>
        <textarea id="master-notes" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} rows={3} maxLength={1000} {...register("notes")} />
        {errors.notes && <span className={"field-error block mt-[7px] text-[length:11px] text-[color:var(--danger)]"}>{t("mastersInvalidField")}</span>}</div>
      {record && <AuthField id="master-reason" label={t("settingsReason")} required maxLength={500} value={reason}
        hint={t("peopleReasonHint")} onChange={(event) => setReason(event.target.value)} />}
    </fieldset>
    {error && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(error)}</p>}
    <div className={"masters-save flex justify-end [border-top:1px_solid_var(--border)] pt-[20px]"}><Button type="submit" loading={isSubmitting}
      disabled={!isValid || Boolean(record && (!isDirty || reason.trim().length < 3))}>{t(isSubmitting ? "usersSaving" : "mastersSave")}</Button></div>
  </form>;
}
