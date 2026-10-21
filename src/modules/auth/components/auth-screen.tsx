"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, HandCoins, KeyRound, LogIn, MailCheck,
  ShieldCheck, UserRoundPlus } from "lucide-react";
import { LanguageSwitch, useLanguage } from "@/components/language-provider";
import { Brand } from "@/components/layout/brand";
import { AuthForm } from "@/modules/auth/components/auth-form";
import type { AuthScreen as AuthScreenType } from "@/modules/auth/auth.schema";
import type { MessageKey } from "@/lib/i18n/messages";
import type { LucideIcon } from "lucide-react";

const screens = {
  login: { title: "loginTitle", description: "loginDescription", icon: LogIn },
  signup: { title: "signupTitle", description: "signupDescription", icon: UserRoundPlus },
  forgot: { title: "forgotTitle", description: "forgotDescription", icon: KeyRound },
  verifySignup: { title: "verifyTitle", description: "verifyDescription", icon: MailCheck },
  verifyReset: { title: "verifyTitle", description: "verifyDescription", icon: MailCheck },
  reset: { title: "resetTitle", description: "resetDescription", icon: ShieldCheck },
} satisfies Record<AuthScreenType, { title: MessageKey; description: MessageKey; icon: LucideIcon }>;

export function AuthScreen({ screen, email, notice, managed = false }: {
  screen: AuthScreenType;
  email?: string;
  notice?: MessageKey;
  managed?: boolean;
}) {
  const { t } = useLanguage();
  const content = screens[screen];
  const Icon = content.icon;

  return (
    <main className={"auth-page min-w-[1366px] min-h-[100vh] grid grid-cols-[43%_57%]"}>
      <aside className={"auth-brand-panel bg-[var(--primary-hover)] text-[color:var(--primary-foreground)] p-[52px_58px] flex flex-col"}>
        <Link href="/login"><Brand inverse /></Link>
        <div className={"auth-story max-w-[390px] my-auto p-[70px_0] [&_h1]:text-[length:43px] [&_h1]:leading-[1.2] [&_h1]:tracking-[-1.7px] [&_>_p]:mt-[23px] [&_>_p]:leading-[1.8] [&_>_p]:text-[color:var(--emerald-100)] [html[lang='ur']_&_h1]:tracking-0"}>
          <h1>{t("authTagline")}</h1>
          <p>{t("authDescription")}</p>
          <div className={"auth-feature flex items-center gap-[13px] mt-[24px] text-[color:var(--emerald-100)] text-[length:13px]"}><BookOpen size={20} aria-hidden="true" />{t("authFeatureBooks")}</div>
          <div className={"auth-feature flex items-center gap-[13px] mt-[24px] text-[color:var(--emerald-100)] text-[length:13px]"}><HandCoins size={20} aria-hidden="true" />{t("authFeatureDonations")}</div>
          <div className={"auth-feature flex items-center gap-[13px] mt-[24px] text-[color:var(--emerald-100)] text-[length:13px]"}><ShieldCheck size={20} aria-hidden="true" />{t("authFeatureAccess")}</div>
        </div>
        <p className={"auth-brand-footer text-[length:12px] text-[color:var(--emerald-200)]"}>{t("institutionLocation")}</p>
      </aside>
      <section className={"auth-main flex flex-col p-[30px_52px] bg-[var(--card)]"}>
        <div className={"auth-top flex justify-between items-center gap-[20px]"}>
          <Link href="/login" className={"text-link text-[color:var(--primary)] bg-[transparent] [border:0] p-[5px_0] inline-flex gap-[6px] items-center text-[length:11px] font-semibold"}><ArrowLeft size={15} className={"directional-icon [html[dir='rtl']_&]:[transform:scaleX(-1)]"} />
            {t("backLogin")}</Link>
          <LanguageSwitch />
        </div>
        <div className={"auth-form-container w-full max-w-[410px] m-auto py-[44px] [&_h2]:text-[length:30px] [&_h2]:font-bold [&_h2]:tracking-[-.8px]"}>
          <span className={"auth-heading-icon inline-flex items-center justify-center w-[52px] h-[52px] text-[color:var(--primary)] bg-[var(--accent)] rounded-[var(--radius)] mb-[23px]"}><Icon size={26} aria-hidden="true" /></span>
          <h2>{t(managed ? "activateTitle" : content.title)}</h2>
          <p className={"auth-description mt-[10px] leading-[1.7] text-[color:var(--muted-foreground)]"}>{t(managed ? "activateDescription" : content.description)}</p>
          {notice && <p className={"auth-notice mt-[22px] text-[color:var(--warning)] bg-[var(--warning-soft)] rounded-[var(--radius-control)] p-[10px_13px] text-[length:11px] leading-[1.7]"} role="status">{t(notice)}</p>}
          <AuthForm screen={screen} email={email} />
          <div className={"auth-bottom mt-[25px] text-center text-[color:var(--muted-foreground)] leading-[1.9] text-[length:12px] [&_a]:text-[color:var(--primary)] [&_a]:font-semibold"}>
            {screen === "login" ? <>{t("firstAccountPrompt")} <Link href="/signup">{t("signup")}</Link></>
              : screen === "signup" ? <>{t("alreadyRegistered")} <Link href="/login">{t("login")}</Link></>
                : <Link href="/login">{t("returnLogin")}</Link>}
          </div>
          {screen === "signup" && !managed && <p className={"auth-footer-note mt-[24px] text-[color:var(--muted-foreground)] text-[length:11px] leading-[1.8]"}>
            {t("manualPromotion")} {t("laterUsers")}
          </p>}
        </div>
      </section>
    </main>
  );
}
