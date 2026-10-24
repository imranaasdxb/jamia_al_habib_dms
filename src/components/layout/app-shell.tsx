"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  Bell, BookOpen, ChevronDown, ClipboardCheck, Flag, HandCoins,
  House, Search, Settings, Users, UserRound, ChartNoAxesCombined,
} from "lucide-react";
import { LanguageSwitch, useLanguage } from "@/components/language-provider";
import { usePageState } from "@/components/page-data-provider";
import { Brand } from "@/components/layout/brand";
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
  const booksActive = pathname === "/books" || pathname.startsWith("/books/") || pathname.startsWith("/receipt-entry");
  const [booksExpanded, setBooksExpanded] = usePageState(`${account.id}:navigation:books`, booksActive);
  const booksSubmenuId = useId();
  const [activeDialog, setActiveDialog] = useState<MessageKey | null>(null);
  const isAccountDialog = activeDialog === "account";
  const accountCardId = useId();
  const accountCardRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const initials = account.fullName.split(" ").filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0)).join("").toUpperCase();

  useEffect(() => { setLanguage(account.language); }, [account.language, setLanguage]);

  useEffect(() => {
    if (!isAccountDialog) return;
    const closeOutside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !accountCardRef.current?.contains(event.target)) {
        setActiveDialog(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDialog(null);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAccountDialog]);

  return (
    <div className={"app-shell min-w-[1366px] min-h-[100vh]"}>
      <aside className={"sidebar w-[var(--sidebar-width)] fixed inset-y-0 start-0 p-[28px_18px] bg-[var(--card)] [border-inline-end:1px_solid_var(--border)] flex flex-col z-[20] [&_.brand]:mx-[8px] [&_.brand]:mb-[35px]"}>
        <Link href="/dashboard" aria-label={t("dashboard")}><Brand /></Link>
        <nav className={"sidebar-nav flex flex-col gap-[8px]"} aria-label={t("donationManagement")}>
          {navigation.filter((item) => (item.label !== "settings" && item.label !== "masters") || account.role === "ADMIN")
            .map(({ label, icon: Icon }) => label === "users" ? (
            <div key={label} className="nav-group">
              <button type="button" className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold nav-group-trigger [&_>_span]:flex-1 [&_>_span]:text-start [&[data-active='true']]:text-[color:var(--primary-hover)] [&[data-active='true']]:font-semibold [&[aria-expanded='true']_.nav-group-chevron]:[transform:rotate(180deg)]"} data-active={usersActive || undefined}
                aria-expanded={usersExpanded} aria-controls={submenuId} onClick={() => setUsersExpanded((value) => !value)}>
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" /><span>{t("users")}</span>
                <ChevronDown size={16} className={"nav-group-chevron [transition:transform_.15s_ease]"} aria-hidden="true" />
              </button>
              <div id={submenuId} className={"nav-submenu flex flex-col gap-[4px] my-[5px] ms-[25px] ps-[12px] [border-inline-start:1px_solid_var(--border)] [&[hidden]]:hidden [&_.nav-item]:min-h-[39px] [&_.nav-item]:text-[length:12px] [&_.nav-item]:px-[13px]"} hidden={!usersExpanded}>
                {account.role === "ADMIN" && <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/users"
                  aria-current={pathname === "/users" ? "page" : undefined}>{t("navAdmins")}</Link>}
                <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/people" aria-current={pathname === "/people" ? "page" : undefined}>
                  {t("peopleCollectors")}</Link>
              </div>
            </div>
          ) : label === "books" ? (
            <div key={label} className="nav-group">
              <button type="button" className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold nav-group-trigger [&_>_span]:flex-1 [&_>_span]:text-start [&[data-active='true']]:text-[color:var(--primary-hover)] [&[data-active='true']]:font-semibold [&[aria-expanded='true']_.nav-group-chevron]:[transform:rotate(180deg)]"} data-active={booksActive || undefined}
                aria-expanded={booksExpanded} aria-controls={booksSubmenuId} onClick={() => setBooksExpanded((value) => !value)}>
                <Icon size={21} strokeWidth={1.7} aria-hidden="true" /><span>{t("books")}</span>
                <ChevronDown size={16} className={"nav-group-chevron [transition:transform_.15s_ease]"} aria-hidden="true" />
              </button>
              <div id={booksSubmenuId} className={"nav-submenu flex flex-col gap-[4px] my-[5px] ms-[25px] ps-[12px] [border-inline-start:1px_solid_var(--border)] [&[hidden]]:hidden [&_.nav-item]:min-h-[39px] [&_.nav-item]:text-[length:12px] [&_.nav-item]:px-[13px]"} hidden={!booksExpanded}>
                {account.role === "ADMIN" && <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/books/editions" aria-current={pathname === "/books/editions" ? "page" : undefined}>{t("mastersEditions")}</Link>}
                <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/books" aria-current={pathname === "/books" ? "page" : undefined}>{t("booksStock")}</Link>
                <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/books/assignments" aria-current={pathname === "/books/assignments" ? "page" : undefined}>{t("assignBooks")}</Link>
                <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/books/returns" aria-current={(pathname === "/books/returns" || pathname.startsWith("/receipt-entry")) ? "page" : undefined}>{t("returnsScreen")}</Link>
                {account.role === "ADMIN" && <Link className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href="/books/leftovers" aria-current={pathname === "/books/leftovers" ? "page" : undefined}>{t("leftoversScreen")}</Link>}
              </div>
            </div>
          ) : label === "dashboard" || label === "settings" || label === "masters" || label === "approvals" || label === "flags" ? (
            <Link key={label} className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} href={`/${label}`}
              aria-current={pathname === `/${label}` ? "page" : undefined}>
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />{t(label)}
            </Link>
          ) : (
            <button key={label} type="button" className={"nav-item flex items-center gap-[15px] w-full min-h-[48px] [border:0] p-[10px_16px] rounded-[var(--radius-control)] text-start bg-[transparent] text-[color:var(--muted-foreground)] [&:hover]:bg-[var(--muted)] [&[aria-current='page']]:text-[color:var(--primary-hover)] [&[aria-current='page']]:bg-[var(--accent)] [&[aria-current='page']]:font-semibold"} onClick={() => setActiveDialog(label)}>
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />{t(label)}
            </button>
          ))}
        </nav>
        {sampleData && <div className={"sidebar-footer mt-auto p-[24px_12px_0]"}><Badge>{t("sampleData")}</Badge></div>}
      </aside>

      <header className={"topbar min-h-[var(--topbar-height)] ms-[var(--sidebar-width)] [border-bottom:1px_solid_var(--border)] bg-[var(--card)] flex items-center justify-between gap-[22px] p-[14px_var(--space-page)]"}>
        {headerTitle ? <span className={"topbar-title text-[length:16px] font-[650]"}>{t(headerTitle)}</span> : <div className={"search-box relative w-[min(52%,_580px)] [&_>_svg]:absolute [&_>_svg]:start-[16px] [&_>_svg]:top-[14px] [&_>_svg]:text-[color:var(--muted-foreground)] [&_>_svg]:pointer-events-none [&_.input]:ps-[45px] [&_.input]:bg-[var(--muted)] [&_.input]:[border-color:transparent]"}>
          <Search size={18} aria-hidden="true" />
          <Input
            type="search"
            aria-label={t(searchLabel === "searchPlaceholder" ? "search" : searchLabel)}
            placeholder={t(searchLabel)}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>}
        <div className={"topbar-actions flex items-center gap-[18px]"}>
          <LanguageSwitch />
          <Button
            variant="ghost"
            size="icon"
            className={"notification-button relative"}
            aria-label={t("notifications")}
            onClick={() => setActiveDialog("notifications")}
          >
            <Bell size={23} aria-hidden="true" /><span className={"notification-dot absolute top-[8px] end-[9px] w-[7px] h-[7px] bg-[var(--primary)] [border:2px_solid_var(--card)] rounded-[50%]"} />
          </Button>
          <div className="relative" ref={accountCardRef}>
          <button ref={profileButtonRef} type="button" className={"profile-button flex items-center gap-[11px] [border:0] bg-[transparent] p-0 text-start"} aria-label={t("profile")}
            aria-expanded={isAccountDialog} aria-controls={accountCardId} aria-haspopup="dialog"
            onClick={() => setActiveDialog(isAccountDialog ? null : "account")}>
            <span className={"avatar inline-flex items-center justify-center shrink-0 w-[39px] h-[39px] rounded-[50%] bg-[var(--accent)] text-[color:var(--accent-foreground)] text-[length:12px] font-semibold profile-avatar relative overflow-hidden [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover"}>{initials}{account.hasPhoto && <img alt=""
              src={`/api/v1/users/${account.id}/photo`} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
            <span><span className={"profile-name block text-[length:13px] font-semibold"}>{account.fullName}</span>
              <span className={"profile-role block text-[length:11px] text-[color:var(--muted-foreground)] mt-[4px]"}>{t(account.role === "ADMIN" ? "superAdmin" : "staff")}</span></span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
          {isAccountDialog && (
            <div id={accountCardId} role="dialog" aria-label={t("account")}
              className="absolute end-0 top-full z-40 mt-3 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-popover)]">
              <div className="flex items-center gap-3 rounded-xl bg-muted p-3.5">
                <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {initials}
                  {account.hasPhoto && <img alt="" className="absolute inset-0 size-full object-cover"
                    src={`/api/v1/users/${account.id}/photo`} onError={(event) => { event.currentTarget.hidden = true; }} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{account.fullName}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{account.email}</p>
                  <p className="mt-1.5 text-xs text-primary">{t(account.role === "ADMIN" ? "superAdmin" : "staff")}</p>
                </div>
              </div>
              <LogoutButton />
            </div>
          )}
          </div>
        </div>
      </header>

      <main className={"workspace ms-[var(--sidebar-width)] p-[26px_var(--space-page)]"}>{children}</main>

      <Dialog
        open={activeDialog !== null && !isAccountDialog}
        onOpenChange={(open) => { if (!open) setActiveDialog(null); }}
        title={activeDialog ? t(activeDialog) : ""}
        description={t("moduleLater")}
      />
    </div>
  );
}
