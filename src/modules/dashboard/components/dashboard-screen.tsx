"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, Clock3, Flag, RefreshCw, TriangleAlert, Users, Wallet } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dashboardResponseSchema } from "@/modules/dashboard/dashboard.schema";
import { receiptRequest } from "@/modules/receipts/receipts.client";
import { displayMoney } from "@/modules/books/returns.schema";
import { indiaToday } from "@/modules/books/assignments.schema";
import type { ChartInterval, DashboardData, DashboardPeriod } from "@/modules/dashboard/dashboard.schema";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Account } from "@/modules/auth/auth.types";

function reconcile(previous: DashboardData | undefined, next: DashboardData) {
  return previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}
const DashboardCharts = dynamic(() => import("@/modules/dashboard/components/dashboard-charts").then(module => module.DashboardCharts), {
  ssr: false,
  loading: () => <Card className="min-h-[350px] animate-pulse rounded-[18px] bg-muted/40 xl:col-span-12" />,
});
const paymentLabels = { CASH: "receiptCash", DIGITAL: "receiptDigital", CHEQUE: "receiptCheque" } as const;
export function DashboardScreen({ account, initialData, initializing = false, initialError }: {
  account: Account; initialData?: DashboardData; initializing?: boolean; initialError?: string;
}) {
  const { t, language } = useLanguage(); const cache = usePageDataCache(); const scope = `${account.id}:dashboard:`;
  const [period, setPeriod] = usePageState<DashboardPeriod>(`${scope}live:period`, "allTime");
  const [interval, setInterval] = usePageState<ChartInterval>(`${scope}live:interval`, "yearly");
  const day = indiaToday(); const params = new URLSearchParams({ period, interval }).toString();
  const [bootstrapError, setBootstrapError] = useState(initialError ?? "");
  const load = useCallback(async () => dashboardResponseSchema.parse(await receiptRequest(`/api/v1/dashboard?${params}`)).data, [params]);
  const query = usePageQuery(`${scope}query:v1:${day}:${params}`, load, {
    reconcile, enabled: !initializing && !bootstrapError,
    initialData: period === "allTime" && interval === "yearly" ? initialData : undefined,
  });
  const savedKey = `${scope}snapshot:${day}:${period}`;
  const data = query.data ?? cache.read<DashboardData | undefined>(savedKey, undefined);
  const current = query.data ?? cache.read<DashboardData | undefined>(`${scope}current:${day}`, undefined);
  useEffect(() => {
    if (!query.data) return;
    cache.write(savedKey, query.data); cache.write(`${scope}current:${day}`, query.data);
  }, [cache, savedKey, scope, day, query.data]);
  const loading = !data && !bootstrapError && (initializing || query.loading || query.stale);
  const moduleLoading = !current && !bootstrapError && (initializing || query.loading || query.stale);
  const money = (value?: number) => value === undefined ? "—" : displayMoney(value, language);
  const number = (value?: number | null) => value == null ? "—" : new Intl.NumberFormat(language === "ur" ? "ur-IN" : "en-IN").format(value);
  const errorCode = bootstrapError || (query.error instanceof Error ? query.error.message : "");
  const c = data?.collection; const books = current?.books; const people = current?.people; const workflow = current?.workflow;
  const stats = [
    { label: "dashboardCollected", value: money(c?.collectedPaise), icon: Wallet, href: "/donors", primary: true, caption: `${t("booksRegular")} ${money(c?.regularPaise)} · ${t("booksToken")} ${money(c?.tokenPaise)}` },
    { label: "dashboardCommission", value: money(c?.commissionPaise), icon: Wallet, href: "/books/returns", primary: false, caption: `${t("dashboardMarkedPaid")} ${money(c?.paidCommissionPaise)}` },
    { label: "dashboardNet", value: money(c?.netPaise), icon: Wallet, href: "/books/returns", primary: false, caption: t("dashboardAfterCommission") },
    { label: "donorsNamed", value: number(c?.namedDonors), icon: Users, href: "/donors", primary: false, caption: `${number(c?.receipts)} ${t("donorsReceipts")}` },
  ] satisfies { label: MessageKey; value: string; icon: typeof Wallet; href: string; primary: boolean; caption: string }[];
  const inventory = [
    { label: "mastersEditions", value: books?.editions, href: account.role === "SUPER_ADMIN" ? "/books/editions" : "/books" },
    { label: "booksInStock", value: books?.inStock, href: "/books" },
    { label: "booksWithCollectors", value: books?.assigned, href: "/books/assignments" },
    { label: "booksClosed", value: books?.closed, href: "/books/returns" },
    { label: "booksPartlyUsed", value: books?.partlyUsed, href: "/books/returns" },
    { label: "booksLost", value: books?.lost, href: "/books" },
    { label: "booksFlagged", value: books?.flagged, href: "/flags" },
    { label: "leftoversScreen", value: books?.leftoverBooks, href: account.role === "SUPER_ADMIN" ? "/books/leftovers" : "/books/returns" },
  ] satisfies { label: MessageKey; value?: number; href: string }[];
  const attention = [
    { label: "overdueBooks", value: workflow?.overdueBooks, href: "/books/returns", icon: BookOpen },
    { label: "dashboardUnsubmitted", value: workflow?.unsubmittedBooks, href: "/books/returns", icon: BookOpen },
    { label: "dashboardDrafts", value: workflow?.draftSubmissions, href: "/books/returns", icon: ClipboardCheck },
    { label: "dashboardUnchecked", value: workflow?.uncheckedReceipts, href: "/receipt-entry", icon: ClipboardCheck },
    { label: "openFlags", value: workflow?.openFlags, href: "/flags", icon: Flag },
    { label: "dashboardIssues", value: workflow?.openIssues, href: "/flags", icon: TriangleAlert },
    { label: "dashboardReceiptRequests", value: workflow?.pendingEdits, href: "/approvals", icon: ClipboardCheck },
    { label: "dashboardProfileRequests", value: workflow?.pendingProfiles, href: "/people", icon: Users },
  ] satisfies { label: MessageKey; value?: number; href: string; icon: typeof BookOpen }[];
  return <AppShell account={account} sampleData={false} headerTitle="dashboard" search="" onSearchChange={() => {}} deferNotifications={initializing}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-[30px] font-bold tracking-tight">{t("dashboard")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("dashboardOverview")}</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs"><CalendarDays size={16} aria-hidden="true" /><select aria-label={t("date")} className="border-0 bg-transparent py-2 outline-none" value={period} onChange={(event) => {
        const value = event.target.value; if (value === "allTime" || value === "thisYear" || value === "thisMonth" || value === "lastMonth") setPeriod(value);
      }}><option value="allTime">{t("dashboardAllTime")}</option><option value="thisYear">{t("dashboardThisYear")}</option><option value="thisMonth">{t("thisMonth")}</option><option value="lastMonth">{t("lastMonth")}</option></select></label>
        <Button variant="outline" size="icon" className="rounded-full" aria-label={t("usersRefresh")} loading={query.loading} disabled={initializing} onClick={() => { setBootstrapError(""); cache.invalidate(`${scope}query:`); }}><RefreshCw size={17} /></Button>
        <Button asChild size="small" className="min-h-10 rounded-full px-4"><Link href="/books/returns"><ClipboardCheck size={16} />{t("returnsScreen")}</Link></Button>
      </div>
    </div>
    {(query.error != null || bootstrapError) && <p className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]" role="alert">{t(errorCode === "SESSION_EXPIRED" ? "authExpired" : errorCode === "ACCESS_DENIED" ? "authDenied" : "dashboardFailed")}</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-busy={loading || undefined}>{stats.map((stat) => <Card key={stat.label} className={`flex min-h-[150px] min-w-0 flex-col rounded-[18px] p-4 ${stat.primary ? "border-emerald-700 bg-gradient-to-br from-emerald-800 to-emerald-600 text-white shadow-sm" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-2"><span className="text-xs font-medium">{t(stat.label)}</span><Link href={stat.href} aria-label={t(stat.label)} className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors ${stat.primary ? "border-white/30 bg-white text-primary" : "border-border hover:bg-muted"}`}><ArrowUpRight size={15} /></Link></div>
      {loading ? <div className="mt-4 h-8 w-3/4 animate-pulse rounded-lg bg-current/10" /> : <strong className="mt-4 block break-words text-[27px] font-semibold leading-tight tracking-tight tabular-nums" dir="ltr">{stat.value}</strong>}
      <p className={`mt-auto flex items-start gap-1.5 pt-3 text-[10px] leading-relaxed ${stat.primary ? "text-emerald-100" : "text-muted-foreground"}`}><stat.icon size={13} className="mt-0.5 shrink-0" />{stat.caption}</p>
    </Card>)}</div>
    <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{t("dashboardFinancialScope")}{data && <> · <bdi>{data.from} — {data.to}</bdi></>}</span><span>{t("dashboardIndiaDates")}</span></div>
    {c?.commissionAllocated && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">{t("dashboardCommissionAllocation")}</p>}
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
      {initializing ? <Card className="min-h-[350px] animate-pulse rounded-[18px] bg-muted/40 xl:col-span-12" />
        : <DashboardCharts data={data} trend={query.data?.trend} interval={interval} onInterval={setInterval} loading={loading} trendLoading={!query.data && (query.loading || query.stale)} />}
      <Card className="min-w-0 rounded-[18px] p-5 xl:col-span-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><BookOpen size={18} className="text-primary" />{t("dashboardModules")}</h2><span className="text-[11px] text-muted-foreground">{t("dashboardBooksTotal")}: <b className="text-foreground">{number(books?.total)}</b></span></div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("dashboardCurrentScope")}{current && <> · <bdi>{current.asOf}</bdi></>}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-busy={moduleLoading || undefined}>{inventory.map((item) => <Link key={item.label} href={item.href} className="rounded-xl border border-border bg-muted/30 px-3 py-4 transition-colors hover:border-primary/30 hover:bg-accent/40"><span className="block text-[10px] text-muted-foreground">{t(item.label)}</span>{moduleLoading ? <span className="mt-2 block h-7 w-12 animate-pulse rounded bg-muted" /> : <strong className="mt-2 block text-2xl font-semibold tabular-nums">{number(item.value)}</strong>}</Link>)}</div>
        <p className="mt-3 text-[11px] text-muted-foreground">{number(books?.leftoverReceipts)} {t("dashboardUnusedReceipts")}</p>
        <div className={`mt-4 grid gap-3 border-t border-border pt-4 ${account.role === "SUPER_ADMIN" ? "grid-cols-3" : "grid-cols-2"}`}>
          <Link href="/people" className="min-w-0 rounded-xl bg-accent/40 p-3"><span className="block text-[10px] text-muted-foreground">{t("dashboardActiveFundraisers")}</span><strong className="mt-1 block text-xl font-semibold tabular-nums text-primary">{number(people?.activeFundraisers)}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{number(people?.fundraisers)} {t("total")}</span></Link>
          <Link href="/people" className="min-w-0 rounded-xl bg-muted/50 p-3"><span className="block text-[10px] text-muted-foreground">{t("dashboardEligibleFundraisers")}</span><strong className="mt-1 block text-xl font-semibold tabular-nums">{number(people?.eligibleFundraisers)}</strong></Link>
          {account.role === "SUPER_ADMIN" && <Link href="/users" className="min-w-0 rounded-xl bg-muted/50 p-3"><span className="block text-[10px] text-muted-foreground">{t("dashboardAdminAccounts")}</span><strong className="mt-1 block text-xl font-semibold tabular-nums">{number(people?.admins)}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{number(people?.activeAdmins)} {t("dashboardActive")}</span></Link>}
        </div>
      </Card>
      <Card className="min-w-0 rounded-[18px] p-5 xl:col-span-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert size={18} className="text-amber-600" />{t("needsAttention")}</h2>
        <div className="mt-3 divide-y divide-border">{attention.map(({ label, value, href, icon: Icon }) => <Link key={label} href={href} className="flex items-center gap-3 py-3 text-xs transition-colors hover:text-primary"><Icon size={16} className="shrink-0 text-muted-foreground" /><span className="flex-1">{t(label)}</span><span className={`min-w-8 rounded-full px-2 py-1 text-center text-[11px] font-medium tabular-nums ${value ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}>{number(value)}</span><ChevronRight size={14} className="shrink-0 text-muted-foreground rtl:rotate-180" /></Link>)}</div>
      </Card>
      <Card className="min-w-0 overflow-hidden rounded-[18px] xl:col-span-12"><div className="flex items-center justify-between gap-3 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={18} className="text-primary" />{t("recentDonations")}</h2><Link href="/donors" className="flex items-center gap-1 text-xs font-medium text-primary">{t("viewAll")}<ChevronRight size={14} className="rtl:rotate-180" /></Link></div>
        <div className="overflow-x-auto [scrollbar-width:thin]"><table className="w-full min-w-[750px] border-collapse text-start text-xs [&_th]:bg-muted/50 [&_th]:px-5 [&_th]:py-3 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-t [&_td]:border-border [&_td]:px-5 [&_td]:py-4"><thead><tr><th>{t("donor")}</th><th>{t("booksNumber")}</th><th className="text-end!">{t("amount")}</th><th>{t("mode")}</th><th>{t("date")}</th><th>{t("status")}</th><th>{t("usersActions")}</th></tr></thead>
          <tbody>{loading ? Array.from({ length: 4 }, (_, i) => <tr key={i}>{Array.from({ length: 7 }, (_, j) => <td key={j}><span className="block h-5 w-20 animate-pulse rounded bg-muted" /></td>)}</tr>) : data?.recent.map((receipt) => <tr key={receipt.id}>
            <td><strong className="font-medium">{receipt.anonymous ? t("receiptAnonymous") : receipt.name || t("donorsUnrecorded")}</strong></td><td><strong className="block text-[11px]">{receipt.bookNumber}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{receipt.editionName}</span></td>
            <td className="whitespace-nowrap text-end! font-semibold tabular-nums text-primary">{money(receipt.amountPaise)}</td><td>{t(paymentLabels[receipt.payment])}</td><td className="whitespace-nowrap tabular-nums">{receipt.date}</td><td><Badge tone={receipt.checked ? "success" : "warning"}>{t(receipt.checked ? "donorsChecked" : "donorsUnchecked")}</Badge></td><td><Button asChild variant="outline" size="small"><Link href={`/receipt-entry/${receipt.returnId}`}>{t("submissionResume")}</Link></Button></td>
          </tr>)}{!loading && data?.recent.length === 0 && <tr><td colSpan={7} className="py-12! text-center! text-muted-foreground">{t("dashboardNoReceipts")}</td></tr>}</tbody>
        </table></div>
      </Card>
    </div>
  </AppShell>;
}
