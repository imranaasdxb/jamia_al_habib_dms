"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/modules/auth/components/auth-field";
import { ProfilePhotoEditor } from "@/modules/users/components/profile-photo-editor";
import { userEditorSchema, verificationResponseSchema } from "@/modules/users/users.schema";
import { userErrorMessage, userMutationChanged, usersRequest } from "@/modules/users/users.client";
import { VALIDATION_PATTERNS } from "@/lib/validation/regex";
import type { CreateUserValues } from "@/modules/users/users.schema";
import type { UserRow } from "@/modules/users/users.types";
import type { MessageKey } from "@/lib/i18n/messages";

const fieldErrors: Record<string, MessageKey> = {
  errorName: "errorName", errorEmail: "errorEmail", errorPassword: "errorPassword", errorConfirm: "errorConfirm",
  usersInvalidPhone: "usersInvalidPhone", usersInvalidAge: "usersInvalidAge", usersInvalidDetails: "usersInvalidDetails",
};
type Verification = z.infer<typeof verificationResponseSchema>["data"];
const photoResponse = z.object({ data: z.object({ updatedAt: z.string() }) });

export function CreateUserForm({ onSaved, onChanged, onBusyChange, actorId, user }: {
  onSaved: () => void; onChanged: () => void; onBusyChange: (busy: boolean) => void;
  actorId: string; user?: UserRow;
}) {
  const { t } = useLanguage();
  const onboarding = !user?.accountCreated;
  const isSelf = user?.id === actorId;
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [flow, setFlow] = useState<Verification | null>(user?.accountCreated ? user.verification : null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const [phase, setPhase] = useState<MessageKey>("usersSaving");
  const [wait, setWait] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [version, setVersion] = useState(user?.updatedAt ?? "");
  const [photoSource, setPhotoSource] = useState(user?.hasPhoto
    ? `/api/v1/users/${user.id}/photo?v=${encodeURIComponent(user.updatedAt)}` : null);
  const { register, handleSubmit, resetField, formState: { errors, isSubmitting, isDirty } } = useForm<CreateUserValues>({
    resolver: zodResolver(userEditorSchema(onboarding)), mode: "onTouched",
    defaultValues: { fullName: user?.fullName ?? "", email: user?.email ?? "",
      phone: user?.phone?.startsWith("+91") ? user.phone.slice(3) : user?.phone ?? "",
      role: user?.role === "ADMIN" ? "ADMIN" : "STAFF", language: user?.language ?? "en",
      age: user?.age === null || user?.age === undefined ? "" : String(user.age),
      gender: user?.gender ?? "UNSPECIFIED", address: user?.address ?? "", remarks: user?.remarks ?? "",
      password: "", confirmPassword: "",
    },
  });
  const fieldError = (value?: string) => value ? t(fieldErrors[value] ?? "usersInvalidDetails") : undefined;

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!flow) return;
    const timer = window.setInterval(() => setWait((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [flow]);

  async function savePhoto(id: string) {
    if (!file && !removePhoto) return version;
    const body = new FormData();
    if (file) body.set("photo", file);
    const payload = await usersRequest(`/api/v1/users/${id}/photo`, {
      method: file ? "POST" : "DELETE", ...(file ? { body } : {}),
    });
    const newVersion = photoResponse.parse(payload).data.updatedAt;
    onChanged();
    setVersion(newVersion);
    setPhotoSource(file ? `/api/v1/users/${id}/photo?v=${encodeURIComponent(newVersion)}` : null);
    setFile(null);
    setRemovePhoto(false);
    return newVersion;
  }

  async function submit(values: CreateUserValues) {
    if (user && !onboarding && !isDirty && !file && !removePhoto) { onSaved(); return; }
    onBusyChange(true);
    setMessage(null);
    try {
      const { password: _password, confirmPassword: _confirmation, ...details } = values;
      void _password; void _confirmation;
      setPhase(file || removePhoto ? "usersUploadingPhoto" : onboarding ? "usersSendingOtp" : "usersSaving");
      const currentVersion = user && !onboarding ? await savePhoto(user.id) : version;
      setPhase(onboarding ? "usersSendingOtp" : "usersSaving");
      const payload = await usersRequest(user ? `/api/v1/users/${user.id}` : "/api/v1/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(!user ? values : onboarding ? { action: "onboard", values }
          : { action: "save", values: details, version: currentVersion }),
      });
      const result = verificationResponseSchema.parse(payload).data;
      onChanged();
      if (result.needsVerification) { setFlow(result); setWait(60); }
      else onSaved();
    } catch (error) { if (userMutationChanged(error)) onChanged(); setMessage(userErrorMessage(error)); }
    finally { resetField("password"); resetField("confirmPassword"); onBusyChange(false); }
  }

  async function verify() {
    if (!flow || busy) return;
    if (!flow.proofComplete && !VALIDATION_PATTERNS.otp.test(code)) { setMessage("errorOtp"); return; }
    setBusy("verify"); setMessage(null); onBusyChange(true);
    try {
      setPhase(file || removePhoto ? "usersUploadingPhoto" : "usersVerifying");
      await savePhoto(flow.personId);
      setPhase("usersVerifying");
      await usersRequest(`/api/v1/users/${flow.personId}`, { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", flowId: flow.flowId, otp: flow.proofComplete ? "000000" : code }),
      });
      onChanged(); setCode(""); onSaved();
    } catch (error) { if (userMutationChanged(error)) onChanged(); setMessage(userErrorMessage(error)); }
    finally { setBusy(null); onBusyChange(false); }
  }

  async function resend() {
    if (!flow || busy || wait > 0) return;
    setBusy("resend"); setMessage(null); onBusyChange(true);
    try {
      await usersRequest(`/api/v1/users/${flow.personId}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resend", flowId: flow.flowId }),
      });
      setWait(60);
      onChanged();
    } catch (error) { setMessage(userErrorMessage(error)); }
    finally { setBusy(null); onBusyChange(false); }
  }

  const photo = <ProfilePhotoEditor source={preview ?? (removePhoto ? null : photoSource)}
    disabled={Boolean(busy) || isSubmitting} onRemove={() => { setFile(null); setRemovePhoto(Boolean(photoSource)); }}
    onChoose={(selected) => {
      if (selected.size === 0 || selected.size > 2 * 1024 * 1024
        || !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
        setMessage("usersInvalidPhoto"); return;
      }
      setMessage(null); setRemovePhoto(false); setFile(selected);
    }} />;

  if (flow) return <form className={"auth-form flex flex-col gap-[19px] mt-[25px] users-editor gap-[21px] [&_.input]:min-h-[44px] [&_.input]:py-[11px] [&_.field-label]:text-[length:12px] [&_.field-label]:font-[550] [&_.field-hint]:text-[length:10px] [&_textarea]:[font:inherit] [&_textarea]:[resize:vertical] users-verification-form [&_.otp-input]:max-w-[310px] [&_.otp-input]:mx-auto [&_>_.button]:min-h-[46px]"} noValidate
    onSubmit={(event) => { event.preventDefault(); void verify(); }}>
    <div className={"users-form-steps flex items-center gap-[8px] [&_span]:flex-1 [&_span]:p-[10px_13px] [&_span]:rounded-[var(--radius-control)] [&_span]:text-[length:11px] [&_span]:text-[color:var(--muted-foreground)] [&_span]:bg-[var(--muted)] [&_[data-current='true']]:bg-[var(--accent)] [&_[data-current='true']]:text-[color:var(--primary)] [&_[data-current='true']]:font-[650] [&_[data-complete='true']]:text-[color:var(--primary)] [&_[data-complete='true']]:bg-[var(--primary-soft)]"}><span data-complete="true">1 · {t("usersProfileDetails")}</span>
      <span data-current="true">2 · {t("verifyTitle")}</span></div>
    <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"}>{t(flow.proofComplete ? "usersProofComplete" : "usersVerifyHelp")} <strong dir="ltr">{flow.email}</strong></p>
    {photo}
    {!flow.proofComplete && <AuthField id="user-otp" label={t("otp")} value={code} inputMode="numeric" autoComplete="one-time-code"
      className={"otp-input tracking-[10px] text-[length:24px] text-center"} maxLength={6} dir="ltr" disabled={Boolean(busy)} required onChange={(event) => setCode(event.target.value)} />}
    {message && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(message)}</p>}
    <Button type="submit" loading={busy === "verify"} disabled={Boolean(busy)}>
      {t(busy === "verify" ? phase : "usersVerifyComplete")}</Button>
    {!flow.proofComplete && <Button variant="outline" loading={busy === "resend"}
      disabled={Boolean(busy) || wait > 0} onClick={() => void resend()}>
      {t(busy === "resend" ? "usersSendingOtp" : "resendCode")}{wait > 0 && ` (${wait} ${t("seconds")})`}
    </Button>}
  </form>;

  return <form className={"auth-form flex flex-col gap-[19px] mt-[25px] users-editor gap-[21px] [&_.input]:min-h-[44px] [&_.input]:py-[11px] [&_.field-label]:text-[length:12px] [&_.field-label]:font-[550] [&_.field-hint]:text-[length:10px] [&_textarea]:[font:inherit] [&_textarea]:[resize:vertical]"} noValidate onSubmit={handleSubmit(submit)}>
    {onboarding && <div className={"users-form-steps flex items-center gap-[8px] [&_span]:flex-1 [&_span]:p-[10px_13px] [&_span]:rounded-[var(--radius-control)] [&_span]:text-[length:11px] [&_span]:text-[color:var(--muted-foreground)] [&_span]:bg-[var(--muted)] [&_[data-current='true']]:bg-[var(--accent)] [&_[data-current='true']]:text-[color:var(--primary)] [&_[data-current='true']]:font-[650] [&_[data-complete='true']]:text-[color:var(--primary)] [&_[data-complete='true']]:bg-[var(--primary-soft)]"}><span data-current="true">1 · {t("usersProfileDetails")}</span>
      <span>2 · {t("verifyTitle")}</span></div>}
    {photo}
    <h3 className={"users-form-section-title text-[length:12px] font-[650] pt-[16px] [border-top:1px_solid_var(--border)]"}>{t("usersProfileDetails")}</h3>
    <div className={"users-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[20px] max-[600px]:grid-cols-[1fr]"}>
      <AuthField id="user-name" label={t("fullName")} autoComplete="name" required maxLength={100}
        error={fieldError(errors.fullName?.message)} {...register("fullName")} />
      <AuthField id="user-email" label={t("email")} type="email" autoComplete="email" required
        readOnly={isSelf} maxLength={254} dir="ltr" hint={t(isSelf ? "usersSelfEmailHint" : "usersEmailChangeHint")}
        error={fieldError(errors.email?.message)} {...register("email")} />
      <AuthField id="user-phone" label={t("usersMobile")} type="tel" inputMode="numeric" required maxLength={10}
        dir="ltr" hint={t("usersMobileHint")} error={fieldError(errors.phone?.message)} {...register("phone")} />
      <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="user-role">{t("usersRole")}</label>
        {isSelf ? <><input id="user-role" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} readOnly value={t("superAdmin")} />
          <input type="hidden" {...register("role")} /></> : <select id="user-role" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("role")}>
          <option value="STAFF">{t("staff")}</option><option value="ADMIN">{t("superAdmin")}</option>
        </select>}</div>
      <AuthField id="user-age" label={t("usersAge")} type="number" min={18} max={80}
        error={fieldError(errors.age?.message)} {...register("age")} />
      <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="user-gender">{t("usersGender")}</label>
        <select id="user-gender" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("gender")}>
          <option value="UNSPECIFIED">{t("usersUnspecified")}</option><option value="MALE">{t("usersMale")}</option>
          <option value="FEMALE">{t("usersFemale")}</option><option value="OTHER">{t("usersOther")}</option>
        </select></div>
      <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="user-language">{t("usersLanguage")}</label>
        <select id="user-language" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} {...register("language")}>
          <option value="en">English</option><option value="ur">اردو</option>
        </select></div>
    </div>
    <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="user-address">{t("usersAddress")}</label>
      <textarea id="user-address" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} rows={2} maxLength={1000} {...register("address")} /></div>
    <div><label className={"field-label block text-[length:12px] font-semibold mb-[8px]"} htmlFor="user-remarks">{t("usersRemarks")}</label>
      <textarea id="user-remarks" className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)]"} rows={2} maxLength={1000} {...register("remarks")} /></div>
    {onboarding && <><h3 className={"users-form-section-title text-[length:12px] font-[650] pt-[16px] [border-top:1px_solid_var(--border)]"}>{t("usersLoginDetails")}</h3><div className={"users-form-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[20px] max-[600px]:grid-cols-[1fr]"}>
      <AuthField id="user-password" label={t("password")} isPassword autoComplete="new-password" required
        maxLength={128} hint={t("passwordHint")} error={fieldError(errors.password?.message)} {...register("password")} />
      <AuthField id="user-confirm" label={t("confirmPassword")} isPassword autoComplete="new-password" required
        maxLength={128} error={fieldError(errors.confirmPassword?.message)} {...register("confirmPassword")} />
    </div></>}
    {message && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(message)}</p>}
    <div className={"users-form-footer flex justify-end sticky bottom-[-30px] z-[2] py-[18px] bg-[var(--card)] [border-top:1px_solid_var(--border)] mb-[-20px]"}><Button type="submit" loading={isSubmitting}
      disabled={!onboarding && !isDirty && !file && !removePhoto}>
      {t(isSubmitting ? phase : onboarding ? "usersCreateSendOtp" : "usersSave")}</Button></div>
  </form>;
}
