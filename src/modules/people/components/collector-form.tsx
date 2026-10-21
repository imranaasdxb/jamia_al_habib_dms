"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { ProfilePhotoEditor } from "@/modules/users/components/profile-photo-editor";
import { collectorDefaults, collectorLabels, peopleError, peopleRequest } from "@/modules/people/people.client";
import { collectorSaveResponseSchema, collectorValuesSchema } from "@/modules/people/people.schema";
import type { CollectorRow, CollectorValues } from "@/modules/people/people.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function CollectorForm({ collector, admin, onBusyChange, onSaved }: {
  collector?: CollectorRow; admin: boolean; onBusyChange: (busy: boolean) => void;
  onSaved: (collector: CollectorRow, requested: boolean) => void;
}) {
  const { t } = useLanguage();
  const [error, setError] = useState<MessageKey | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [reason, setReason] = useState("");
  const [samePhone, setSamePhone] = useState(Boolean(collector?.whatsapp && collector.whatsapp === collector.phone));
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting, isDirty, isValid } } = useForm<CollectorValues>({
    resolver: zodResolver(collectorValuesSchema), mode: "onChange",
    defaultValues: collector ? collectorValuesSchema.strip().parse(collector) : collectorDefaults,
  });
  const phone = watch("phone");
  useEffect(() => { if (samePhone) setValue("whatsapp", phone, { shouldValidate: true, shouldDirty: true }); }, [phone, samePhone, setValue]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(values: CollectorValues) {
    if (collector && reason.trim().length < 3) { setError("peopleReasonHint"); return; }
    onBusyChange(true); setError(null);
    try {
      const body = new FormData();
      body.set("data", JSON.stringify({ values, version: collector?.updatedAt, reason, removePhoto }));
      if (file) body.set("photo", file);
      const result = collectorSaveResponseSchema.parse(await peopleRequest(collector ? `/api/v1/people/${collector.id}` : "/api/v1/people",
        { method: "POST", body })).data;
      onSaved(result.collector, result.requested);
    } catch (error) { setError(peopleError(error)); }
    finally { onBusyChange(false); }
  }
  function field(key: keyof CollectorValues, required = false, type = "text", extra: { min?: number; max?: number; step?: string; maxLength?: number } = {}) {
    return <AuthField key={key} id={`collector-${key}`} label={t(collectorLabels[key])} type={type}
      required={required} maxLength={120} {...extra} error={errors[key] ? t("peopleInvalidField") : undefined} {...register(key)} />;
  }
  const source = preview ?? (removePhoto || !collector?.hasPhoto ? null
    : `/api/v1/people/${collector.id}/photo?v=${encodeURIComponent(collector.updatedAt)}`);
  return <form className={"auth-form flex flex-col gap-[19px] mt-[25px] users-editor gap-[21px] [&_.input]:min-h-[44px] [&_.input]:py-[11px] [&_.field-label]:text-[length:12px] [&_.field-label]:font-[550] [&_.field-hint]:text-[length:10px] [&_textarea]:[font:inherit] [&_textarea]:[resize:vertical]"} noValidate onSubmit={handleSubmit(submit)}>
    <fieldset className={"people-form-fields grid gap-[21px] [border:0] p-0 m-0 min-w-0"} disabled={isSubmitting}>
      <ProfilePhotoEditor source={source} disabled={isSubmitting} onRemove={() => { setFile(null); setRemovePhoto(Boolean(collector?.hasPhoto)); }}
        onChoose={(selected) => {
          if (!selected.size || selected.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
            setError("usersInvalidPhoto"); return;
          }
          setError(null); setFile(selected); setRemovePhoto(false);
        }} />
      <h3 className={"users-form-section-title text-[length:12px] font-[650] pt-[16px] [border-top:1px_solid_var(--border)]"}>{t("usersProfileDetails")}</h3>
      <div className={"users-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[20px] max-[600px]:grid-cols-[1fr]"}>
        {field("fullName", true, "text", { maxLength: 100 })}{field("phone", true, "tel", { maxLength: 10 })}
        <AuthField id="collector-email" label={t("peopleOptionalEmail")} type="email" maxLength={254}
          hint={t("peopleNoLogin")} error={errors.email ? t("errorEmail") : undefined} {...register("email")} />
        {field("age", true, "number", { min: 18, max: 80 })}
        <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="collector-gender">{t("usersGender")} *</label>
          <select id="collector-gender" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("gender")}>
            <option value="MALE">{t("usersMale")}</option><option value="FEMALE">{t("usersFemale")}</option><option value="OTHER">{t("usersOther")}</option>
          </select></div>
        <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="collector-status">{t("status")} *</label>
          <select id="collector-status" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("status")}>
            <option value="ACTIVE">{t("usersActive")}</option><option value="INACTIVE">{t("usersInactive")}</option><option value="BLOCKED">{t("usersBlocked")}</option>
          </select></div>
        {field("fatherName", false, "text", { maxLength: 100 })}
        <div><AuthField id="collector-whatsapp" label={t("peopleWhatsapp")} type="tel" maxLength={10} readOnly={samePhone}
          error={errors.whatsapp ? t("usersInvalidPhone") : undefined} {...register("whatsapp")} />
          <label className={"people-checkbox flex items-center gap-[8px] mt-[9px] text-[length:11px] text-[color:var(--muted-foreground)] [&_input]:[accent-color:var(--primary)]"}><input type="checkbox" checked={samePhone} onChange={(event) => setSamePhone(event.target.checked)} />{t("peopleSamePhone")}</label></div>
        {field("commission", false, "number", { min: 0, max: 100, step: "0.01" })}
        <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="collector-language">{t("usersLanguage")}</label>
          <select id="collector-language" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("language")}><option value="en">English</option><option value="ur">اردو</option></select></div>
        <div className={"people-full-width col-[1_/_-1]"}><AuthField id="collector-proof" label={t("peopleIdProof")} maxLength={160}
          hint={t("peopleIdHint")} error={errors.idProofName ? t("peopleInvalidField") : undefined} {...register("idProofName")} />
          <input className={"people-proof-file text-[length:11px] text-[color:var(--muted-foreground)] mt-[10px]"} type="file" aria-label={t("peopleIdProof")} onChange={(event) => {
            const selected = event.target.files?.[0]; if (selected) setValue("idProofName", selected.name, { shouldDirty: true, shouldValidate: true });
            event.target.value = "";
          }} /></div>
      </div>
      <h3 className={"users-form-section-title text-[length:12px] font-[650] pt-[16px] [border-top:1px_solid_var(--border)]"}>{t("usersAddress")}</h3>
      <div className={"users-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[20px] max-[600px]:grid-cols-[1fr]"}>{field("village", true)}{field("postOffice", true)}{field("block")}
        {field("district", true)}{field("state", true)}{field("pin", true, "text", { maxLength: 6 })}</div>
      <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="collector-remarks">{t("usersRemarks")}</label>
        <textarea id="collector-remarks" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} rows={3} maxLength={1000} {...register("remarks")} /></div>
      {collector && <AuthField id="collector-reason" label={t("settingsReason")} required value={reason} maxLength={500}
        hint={t("peopleReasonHint")} onChange={(event) => setReason(event.target.value)} />}
    </fieldset>
    {error && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(error)}</p>}
    <div className={"users-form-footer flex justify-end sticky bottom-[-30px] z-[2] py-[18px] bg-[var(--card)] [border-top:1px_solid_var(--border)] mb-[-20px]"}><Button type="submit" loading={isSubmitting}
      disabled={!isValid || Boolean(collector && ((!isDirty && !file && !removePhoto) || reason.trim().length < 3))}>
      {t(isSubmitting ? "usersSaving" : collector && !admin ? "peopleRequestEdit" : "usersSave")}</Button></div>
  </form>;
}
