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
    <main className="auth-page">
      <aside className="auth-brand-panel">
        <Link href="/login"><Brand inverse /></Link>
        <div className="auth-story">
          <h1>{t("authTagline")}</h1>
          <p>{t("authDescription")}</p>
          <div className="auth-feature"><BookOpen size={20} aria-hidden="true" />{t("authFeatureBooks")}</div>
          <div className="auth-feature"><HandCoins size={20} aria-hidden="true" />{t("authFeatureDonations")}</div>
          <div className="auth-feature"><ShieldCheck size={20} aria-hidden="true" />{t("authFeatureAccess")}</div>
        </div>
        <p className="auth-brand-footer">{t("institutionLocation")}</p>
      </aside>
      <section className="auth-main">
        <div className="auth-top">
          <Link href="/login" className="text-link"><ArrowLeft size={15} className="directional-icon" />
            {t("backLogin")}</Link>
          <LanguageSwitch />
        </div>
        <div className="auth-form-container">
          <span className="auth-heading-icon"><Icon size={26} aria-hidden="true" /></span>
          <h2>{t(managed ? "activateTitle" : content.title)}</h2>
          <p className="auth-description">{t(managed ? "activateDescription" : content.description)}</p>
          {notice && <p className="auth-notice" role="status">{t(notice)}</p>}
          <AuthForm screen={screen} email={email} />
          <div className="auth-bottom">
            {screen === "login" ? <>{t("firstAccountPrompt")} <Link href="/signup">{t("signup")}</Link></>
              : screen === "signup" ? <>{t("alreadyRegistered")} <Link href="/login">{t("login")}</Link></>
                : <Link href="/login">{t("returnLogin")}</Link>}
          </div>
          {screen === "signup" && !managed && <p className="auth-footer-note">
            {t("manualPromotion")} {t("laterUsers")}
          </p>}
        </div>
      </section>
    </main>
  );
}
