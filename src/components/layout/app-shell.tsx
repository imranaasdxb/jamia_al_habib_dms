"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  Bell, BookOpen, ChevronDown, ClipboardCheck, FilePenLine, Flag, HandCoins,
  House, Search, Settings, Users, UserRound, ChartNoAxesCombined,
} from "lucide-react";
import { LanguageSwitch, useLanguage } from "@/components/language-provider";
import { usePageState } from "@/components/page-data-provider";
import { Brand } from "@/components/layout/brand";
import { SessionActivity } from "@/components/layout/session-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LogoutButton } from "@/modules/auth/components/logout-button";
import type { ReactNode } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Account } from "@/modules/auth/auth.types";

const navigation = [
  { label: "dashboard", icon: House },
  { label: "users", icon: Users },
  { label: "books", icon: BookOpen },
  { label: "receiptEntry", icon: FilePenLine },
  { label: "donations", icon: HandCoins },
  { label: "donors", icon: UserRound },
  { label: "reports", icon: ChartNoAxesCombined },
  { label: "approvals", icon: ClipboardCheck },
  { label: "flags", icon: Flag },
  { label: "masters", icon: ClipboardCheck },
  { label: "settings", icon: Settings },
] as const;

interface AppShellProps {
  account: Account;
  children: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel?: MessageKey;
  sampleData?: boolean;
  headerTitle?: MessageKey;
}

export function AppShell({ children, search, onSearchChange, account,
  searchLabel = "searchPlaceholder", sampleData = true, headerTitle }: AppShellProps) {
  const { t, setLanguage } = useLanguage();
  const pathname = usePathname();
  const usersActive = pathname === "/users" || pathname.startsWith("/users/")
    || pathname === "/people" || pathname.startsWith("/people/");
  const [usersExpanded, setUsersExpanded] = usePageState(`${account.id}:navigation:users`, usersActive);
  const submenuId = useId();
  const [activeDialog, setActiveDialog] = useState<MessageKey | null>(null);
  const isAccountDialog = activeDialog === "account";
  const initials = account.fullName.split(" ").filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0)).join("").toUpperCase();

  useEffect(() => { setLanguage(account.language); }, [account.language, setLanguage]);

  return (
    <div className="app-shell">
      <SessionActivity timeoutMinutes={account.sessionTimeoutMinutes} accountId={account.id} />
      <aside className="sidebar">
        <Link href="/dashboard" aria-label={t("dashboard")}><Brand /></Link>
        <nav className="sidebar-nav" aria-label={t("donationManagement")}>
          {navigation.filter((item) => (item.label !== "settings" && item.label !== "masters") || account.role === "ADMIN")
            .map(({ label, icon: Icon }) => label === "users" ? (
            <div key={label} className="nav-group">
              <button type="button" className="nav-item nav-group-trigger" data-active={usersActive || undefined}
                aria-expanded={usersExpanded} aria-controls={submenuId} onClick={() => setUsersExpanded((value) => !value)}>
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" /><span>{t("users")}</span>
                <ChevronDown size={16} className="nav-group-chevron" aria-hidden="true" />
              </button>
              <div id={submenuId} className="nav-submenu" hidden={!usersExpanded}>
                {account.role === "ADMIN" && <Link className="nav-item" href="/users"
                  aria-current={pathname === "/users" ? "page" : undefined}>{t("navAdmins")}</Link>}
                <Link className="nav-item" href="/people" aria-current={pathname === "/people" ? "page" : undefined}>
                  {t("peopleCollectors")}</Link>
              </div>
            </div>
          ) : label === "dashboard" || label === "settings" || label === "masters" ? (
            <Link key={label} className="nav-item" href={`/${label}`}
              aria-current={pathname === `/${label}` ? "page" : undefined}>
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />{t(label)}
            </Link>
          ) : (
            <button key={label} type="button" className="nav-item" onClick={() => setActiveDialog(label)}>
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />{t(label)}
            </button>
          ))}
        </nav>
        {sampleData && <div className="sidebar-footer"><Badge>{t("sampleData")}</Badge></div>}
      </aside>

      <header className="topbar">
        {headerTitle ? <span className="topbar-title">{t(headerTitle)}</span> : <div className="search-box">
          <Search size={18} aria-hidden="true" />
          <Input
            type="search"
            aria-label={t(searchLabel === "searchPlaceholder" ? "search" : searchLabel)}
            placeholder={t(searchLabel)}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>}
        <div className="topbar-actions">
          <LanguageSwitch />
          <Button
            variant="ghost"
            size="icon"
            className="notification-button"
            aria-label={t("notifications")}
            onClick={() => setActiveDialog("notifications")}
          >
            <Bell size={23} aria-hidden="true" /><span className="notification-dot" />
          </Button>
          <button type="button" className="profile-button" aria-label={t("profile")}
            onClick={() => setActiveDialog("account")}>
            <span className="avatar profile-avatar">{initials}{account.hasPhoto && <img alt=""
              src={`/api/v1/users/${account.id}/photo`} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
            <span><span className="profile-name">{account.fullName}</span>
              <span className="profile-role">{t(account.role === "ADMIN" ? "superAdmin" : "staff")}</span></span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="workspace">{children}</main>

      <Dialog
        open={activeDialog !== null}
        onOpenChange={(open) => { if (!open) setActiveDialog(null); }}
        title={activeDialog ? t(activeDialog) : ""}
        description={t(isAccountDialog ? "accountDescription" : "moduleLater")}
      >
        {isAccountDialog && (
          <div className="dialog-actions">
            <p className="muted" dir="ltr">{account.email}</p>
            <LogoutButton />
          </div>
        )}
      </Dialog>
    </div>
  );
}
