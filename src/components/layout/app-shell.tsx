"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, ChevronDown, ClipboardCheck, Flag, HandCoins,
  House, Settings, Users, UserRound, ChartNoAxesCombined, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { LanguageSwitch, useLanguage } from "@/components/language-provider";
import { usePageState } from "@/components/page-data-provider";
import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalSearch, HeaderNotifications } from "@/modules/navigation/components/header-tools";
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
  search?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: MessageKey;
  sampleData?: boolean;
  headerTitle?: MessageKey;
  deferNotifications?: boolean;
}

export function AppShell({ children, account, sampleData = true, deferNotifications = false }: AppShellProps) {
  const { t, setLanguage } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const showBack = pathname !== "/dashboard";
  const [sidebarCollapsed, setSidebarCollapsed] = usePageState(`${account.id}:navigation:collapsed`, false);
  const sidebarId = useId();
  const usersActive = pathname === "/users" || pathname.startsWith("/users/")
    || pathname === "/people" || pathname.startsWith("/people/");
  const [usersExpanded, setUsersExpanded] = usePageState(`${account.id}:navigation:users`, usersActive);
  const submenuId = useId();
  const booksActive = pathname === "/books" || pathname.startsWith("/books/") || pathname.startsWith("/receipt-entry");
  const [booksExpanded, setBooksExpanded] = usePageState(`${account.id}:navigation:books`, booksActive);
  const booksSubmenuId = useId();
  const [activeDialog, setActiveDialog] = useState<"account" | null>(null);
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
    <div className={`app-shell min-h-dvh min-w-[1024px] bg-muted pb-3 pt-3 [--space-page:22px] [--space-panel:18px] [--space-gap:16px] [--topbar-height:88px] ${sidebarCollapsed ? "[--sidebar-width:72px]" : "[--sidebar-width:224px]"}`}>
      <aside id={sidebarId} className={`sidebar fixed inset-y-3 start-3 z-20 flex w-[var(--sidebar-width)] flex-col rounded-[20px] border border-border/60 bg-card p-3 shadow-[0_2px_12px_rgb(16_27_46/2%)] transition-[width] duration-200 motion-reduce:transition-none [&_.brand]:gap-2 [&_.brand_svg]:size-7 [&_.brand_strong]:text-sm [&_.brand_strong]:tracking-tight [&_.brand_span]:text-[9px] [&_.nav-item>svg]:shrink-0 ${sidebarCollapsed ? "[&_.brand>div]:hidden [&_.nav-item]:justify-center [&_.nav-item]:gap-0 [&_.nav-item]:px-0 [&_.nav-item>span]:hidden [&_.nav-group-chevron]:hidden [&_.sidebar-nav]:pe-0" : ""}`}>
        <div className={`mb-5 mt-1 flex min-h-8 items-center gap-1 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/dashboard" aria-label={t("dashboard")} className="min-w-0"><Brand /></Link>
          <button type="button" className={`flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sidebarCollapsed ? "absolute end-0 top-8 z-10 size-6 -translate-y-1/2 translate-x-1/2 border border-border bg-card shadow-sm rtl:-translate-x-1/2" : "size-7"}`}
            aria-label={t(sidebarCollapsed ? "layoutExpandSidebar" : "layoutCollapseSidebar")}
            title={t(sidebarCollapsed ? "layoutExpandSidebar" : "layoutCollapseSidebar")}
            aria-expanded={!sidebarCollapsed} aria-controls={sidebarId}
            onClick={() => setSidebarCollapsed((value) => !value)}>
            {sidebarCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
        </div>
        {!sidebarCollapsed && <p className="mb-2 px-3 text-[9px] font-medium uppercase tracking-[.14em] text-muted-foreground">{t("layoutMenu")}</p>}
        <nav className={"sidebar-nav flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pe-1 [scrollbar-width:thin] [scrollbar-color:var(--emerald-200)_transparent]"} aria-label={t("donationManagement")}>
          {navigation.filter((item) => (item.label !== "settings" && item.label !== "masters") || account.role === "SUPER_ADMIN")
            .map(({ label, icon: Icon }) => label === "users" ? (
            <div key={label} className="nav-group">
              <button type="button" className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-[''] nav-group-trigger [&_>_span]:flex-1 [&_>_span]:text-start [&[data-active='true']]:text-[color:var(--primary-hover)] [&[data-active='true']]:font-semibold [&[aria-expanded='true']_.nav-group-chevron]:[transform:rotate(180deg)]"} data-active={usersActive || undefined}
                aria-label={t("users")} title={sidebarCollapsed ? t("users") : undefined}
                aria-expanded={!sidebarCollapsed && usersExpanded} aria-controls={submenuId} onClick={() => { if (sidebarCollapsed) { setSidebarCollapsed(false); setUsersExpanded(true); } else setUsersExpanded((value) => !value); }}>
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{t("users")}</span>
                <ChevronDown size={16} className={"nav-group-chevron [transition:transform_.15s_ease]"} aria-hidden="true" />
              </button>
              <div id={submenuId} className={"nav-submenu my-1 ms-5 flex flex-col gap-0.5 border-s border-border ps-3 [&[hidden]]:hidden [&_.nav-item]:min-h-8 [&_.nav-item]:px-2.5 [&_.nav-item]:text-xs"} hidden={sidebarCollapsed || !usersExpanded}>
                {account.role === "SUPER_ADMIN" && <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/users"
                  aria-current={pathname === "/users" ? "page" : undefined}>{t("navAdmins")}</Link>}
                <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/people" aria-current={pathname === "/people" ? "page" : undefined}>
                  {t("peopleCollectors")}</Link>
              </div>
            </div>
          ) : label === "books" ? (
            <div key={label} className="nav-group">
              <button type="button" className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-[''] nav-group-trigger [&_>_span]:flex-1 [&_>_span]:text-start [&[data-active='true']]:text-[color:var(--primary-hover)] [&[data-active='true']]:font-semibold [&[aria-expanded='true']_.nav-group-chevron]:[transform:rotate(180deg)]"} data-active={booksActive || undefined}
                aria-label={t("books")} title={sidebarCollapsed ? t("books") : undefined}
                aria-expanded={!sidebarCollapsed && booksExpanded} aria-controls={booksSubmenuId} onClick={() => { if (sidebarCollapsed) { setSidebarCollapsed(false); setBooksExpanded(true); } else setBooksExpanded((value) => !value); }}>
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{t("books")}</span>
                <ChevronDown size={16} className={"nav-group-chevron [transition:transform_.15s_ease]"} aria-hidden="true" />
              </button>
              <div id={booksSubmenuId} className={"nav-submenu my-1 ms-5 flex flex-col gap-0.5 border-s border-border ps-3 [&[hidden]]:hidden [&_.nav-item]:min-h-8 [&_.nav-item]:px-2.5 [&_.nav-item]:text-xs"} hidden={sidebarCollapsed || !booksExpanded}>
                {account.role === "SUPER_ADMIN" && <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/books/editions" aria-current={pathname === "/books/editions" ? "page" : undefined}>{t("mastersEditions")}</Link>}
                <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/books" aria-current={pathname === "/books" ? "page" : undefined}>{t("booksStock")}</Link>
                <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/books/assignments" aria-current={pathname === "/books/assignments" ? "page" : undefined}>{t("assignBooks")}</Link>
                <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/books/returns" aria-current={(pathname === "/books/returns" || pathname.startsWith("/receipt-entry")) ? "page" : undefined}>{t("returnsScreen")}</Link>
                {account.role === "SUPER_ADMIN" && <Link className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href="/books/leftovers" aria-current={pathname === "/books/leftovers" ? "page" : undefined}>{t("leftoversScreen")}</Link>}
              </div>
            </div>
          ) : (
            <Link key={label} className={"nav-item relative flex min-h-10 w-full items-center gap-2.5 rounded-xl border-0 bg-transparent px-3 py-2 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted [&[aria-current='page']]:bg-[var(--primary-soft)] [&[aria-current='page']]:font-semibold [&[aria-current='page']]:text-primary [&[aria-current='page']]:before:absolute [&[aria-current='page']]:before:start-0 [&[aria-current='page']]:before:h-5 [&[aria-current='page']]:before:w-0.5 [&[aria-current='page']]:before:rounded-full [&[aria-current='page']]:before:bg-primary [&[aria-current='page']]:before:content-['']"} href={`/${label}`}
              aria-label={t(label)} title={sidebarCollapsed ? t(label) : undefined}
              aria-current={pathname === `/${label}` ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.6} aria-hidden="true" /><span>{t(label)}</span>
            </Link>
          ))}
        </nav>
        {sampleData && !sidebarCollapsed && <div className={"sidebar-footer mt-3 shrink-0 rounded-xl border border-primary/10 bg-[var(--primary-soft)] px-3 py-3"}><Badge>{t("sampleData")}</Badge></div>}
      </aside>

      <div className="sticky top-0 z-30 -mt-3 me-3 ms-[calc(var(--sidebar-width)_+_24px)] bg-muted/75 py-3 backdrop-blur-xl backdrop-saturate-150 transition-[margin-inline-start] duration-200 motion-reduce:transition-none">
      <header className={"topbar flex h-16 items-center justify-between gap-4 rounded-[18px] border border-primary/10 bg-[var(--primary-soft)] px-4 shadow-[0_4px_20px_rgb(16_27_46/5%)]"}>
        <GlobalSearch account={account} />
        <div className={"topbar-actions flex items-center gap-3 [&_.language-switch]:rounded-full [&_.language-switch]:bg-white [&_.language-switch]:border-transparent [&_.language-switch]:p-0.5 [&_.language-switch_button]:min-w-10 [&_.language-switch_button]:rounded-full [&_.language-switch_button]:px-2.5 [&_.language-switch_button]:py-1.5 [&_.language-switch_button]:text-[11px]"}>
          <LanguageSwitch />
          <HeaderNotifications account={account} defer={deferNotifications} />
          <div className="relative" ref={accountCardRef}>
          <button ref={profileButtonRef} type="button" className={"profile-button flex items-center gap-2.5 rounded-full border-0 bg-white p-1 pe-3 text-start transition-colors hover:bg-white/80 [&_>_svg]:text-primary"} aria-label={t("profile")}
            aria-expanded={isAccountDialog} aria-controls={accountCardId} aria-haspopup="dialog"
            onClick={() => setActiveDialog(isAccountDialog ? null : "account")}>
            <span className={"avatar inline-flex items-center justify-center shrink-0 w-[34px] h-[34px] rounded-[50%] bg-white text-primary text-[length:12px] font-semibold profile-avatar relative overflow-hidden [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover"}>{initials}{account.hasPhoto && <img alt=""
              src={`/api/v1/users/${account.id}/photo`} onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
            <span><span className={"profile-name block text-[length:13px] font-semibold"}>{account.fullName}</span>
              <span className={"profile-role block text-[length:11px] text-[color:var(--muted-foreground)] mt-[4px]"}>{t(account.role === "SUPER_ADMIN" ? "superAdmin" : "staff")}</span></span>
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
                  <p className="mt-1.5 text-xs text-primary">{t(account.role === "SUPER_ADMIN" ? "superAdmin" : "staff")}</p>
                </div>
              </div>
              <LogoutButton />
            </div>
          )}
          </div>
        </div>
      </header>
      </div>

      <main className={`workspace relative transition-[margin-inline-start] duration-200 motion-reduce:transition-none me-3 ms-[calc(var(--sidebar-width)_+_24px)] min-h-[calc(100dvh_-_100px)] rounded-[24px] border border-border/60 bg-background px-[var(--space-page)] py-5 shadow-[0_2px_12px_rgb(16_27_46/2%)] [&_h1]:flex [&_h1]:min-h-10 [&_h1]:items-center [&_h1]:text-[28px] [&_h1]:tracking-tight ${showBack ? "[&_h1]:ps-11" : ""}`}>
        {showBack && <Button variant="outline" size="icon" className="absolute start-[var(--space-page)] top-6 z-10 size-8 min-h-8 rounded-full border-border bg-card p-1.5"
          aria-label={t("layoutBack")} title={t("layoutBack")} onClick={() => { if (window.history.length > 1) router.back(); else router.push("/dashboard"); }}>
          <ArrowLeft size={16} strokeWidth={1.7} className="[html[dir='rtl']_&]:rotate-180" aria-hidden="true" />
        </Button>}
        {children}
      </main>

    </div>
  );
}
