"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { AuthField } from "@/modules/auth/components/auth-field";
import { createAuthSchema } from "@/modules/auth/auth.schema";
import { authErrorMessage, submitAuthForm } from "@/modules/auth/auth.client";
import type { AuthFormValues, AuthScreen } from "@/modules/auth/auth.schema";
import type { MessageKey } from "@/lib/i18n/messages";

const submitLabels = {
  login: "login",
  signup: "createAccount",
  forgot: "sendCode",
  verifySignup: "verifyCode",
  verifyReset: "verifyCode",
  reset: "savePassword",
} satisfies Record<AuthScreen, MessageKey>;

export function AuthForm({ screen, email = "" }: { screen: AuthScreen; email?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [isError, setIsError] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const isVerification = screen === "verifySignup" || screen === "verifyReset";
  const [resendWait, setResendWait] = useState(isVerification ? 60 : 0);
  const hasEmail = screen === "login" || screen === "signup" || screen === "forgot";
  const hasPassword = screen === "login" || screen === "signup" || screen === "reset";
  const hasConfirmPassword = screen === "signup" || screen === "reset";
  const schema = createAuthSchema(screen, {
    name: t("errorName"),
    email: t("errorEmail"),
    requiredPassword: t("errorRequiredPassword"),
    password: t("errorPassword"),
    confirm: t("errorConfirm"),
    otp: t("errorOtp"),
  });
  const { register, handleSubmit, resetField, formState: { errors, isSubmitting } } = useForm<AuthFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", code: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!isVerification) return;
    const timer = window.setInterval(() => setResendWait((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [isVerification]);

  async function submit(values: AuthFormValues) {
    setMessage(null);
    try {
      const result = await submitAuthForm(screen, values, email);
      if (result.error) {
        setIsError(true);
        setMessage(authErrorMessage(result.error));
      } else if (result.redirectTo) {
        router.replace(result.redirectTo);
        router.refresh();
      }
    } catch {
      setIsError(true);
      setMessage("authUnavailable");
    } finally {
      resetField("password");
      resetField("confirmPassword");
    }
  }

  async function resendCode() {
    if (resendWait > 0 || isResending) return;
    setIsResending(true);
    setMessage(null);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email,
        type: screen === "verifyReset" ? "forget-password" : "email-verification" });
      setIsError(Boolean(result.error));
      setMessage(result.error ? authErrorMessage(result.error) : "authCodeSent");
      if (!result.error) setResendWait(60);
    } catch {
      setIsError(true);
      setMessage("authUnavailable");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <form className={"auth-form flex flex-col gap-[19px] mt-[25px]"} noValidate onSubmit={handleSubmit(submit)}>
      {screen === "signup" && (
        <AuthField id="full-name" label={t("fullName")} placeholder={t("namePlaceholder")}
          autoComplete="name" maxLength={100} required error={errors.fullName?.message}
          {...register("fullName")} />
      )}
      {hasEmail && (
        <AuthField id="email" type="email" label={t("email")} placeholder={t("emailPlaceholder")}
          autoComplete="email" inputMode="email" maxLength={254} dir="ltr" required
          error={errors.email?.message} {...register("email")} />
      )}
      {hasPassword && (
        <AuthField id="password" isPassword label={t(screen === "reset" ? "newPassword" : "password")}
          placeholder={t("passwordPlaceholder")} required maxLength={128}
          autoComplete={screen === "login" ? "current-password" : "new-password"}
          hint={hasConfirmPassword ? t("passwordHint") : undefined}
          error={errors.password?.message} {...register("password")} />
      )}
      {hasConfirmPassword && (
        <AuthField id="confirm-password" isPassword label={t("confirmPassword")}
          autoComplete="new-password" required maxLength={128}
          error={errors.confirmPassword?.message} {...register("confirmPassword")} />
      )}
      {screen === "login" && (
        <div className={"auth-secondary flex justify-end mt-[-8px]"}><Link className={"text-link text-[color:var(--primary)] bg-[transparent] [border:0] p-[5px_0] inline-flex gap-[6px] items-center text-[length:11px] font-semibold"} href="/forgot-password">
          {t("forgotPassword")}</Link></div>
      )}
      {isVerification && <>
        <p className={"field-hint block mt-[8px] text-[length:11px] text-[color:var(--muted-foreground)] leading-[1.7]"} dir="ltr">{email}</p>
        <AuthField id="verification-code" label={t("otp")} className={"otp-input tracking-[10px] text-[length:24px] text-center numeric tabular-nums"}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr"
          hint={t("otpHint")} required error={errors.code?.message} {...register("code")} />
      </>}
      <Button type="submit" className={"auth-submit w-full mt-[2px]"} disabled={isSubmitting || isResending}>
        {t(isSubmitting ? "working" : submitLabels[screen])}
        <ArrowRight size={17} className={"directional-icon [html[dir='rtl']_&]:[transform:scaleX(-1)]"} aria-hidden="true" />
      </Button>
      {isVerification && (
        <Button variant="ghost" disabled={resendWait > 0 || isResending || isSubmitting} onClick={resendCode}>
          {resendWait > 0 ? `${t("authResendWait")} ${resendWait} ${t("seconds")}` : t("resendCode")}
        </Button>
      )}
      {message && <div className={isError ? "form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]" : "form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"}
        role={isError ? "alert" : "status"} aria-live="polite">{t(message)}</div>}
    </form>
  );
}
