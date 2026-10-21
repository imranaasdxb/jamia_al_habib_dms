"use client";

import { useState } from "react";
import { ArrowRight, ArrowUp, BookOpen, CalendarDays, ChevronRight, ClipboardCheck,
  Clock3, Flag, Plus, TriangleAlert, Users, Wallet } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageState } from "@/components/page-data-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { DashboardCharts } from "@/modules/dashboard/components/dashboard-charts";
import { donationPreviews, periodPreviews } from "@/modules/dashboard/dashboard.data";
import { formatCurrency } from "@/lib/utils";
import type { DashboardPeriod } from "@/modules/dashboard/dashboard.data";
import type { MessageKey } from "@/lib/i18n/messages";
import type { Account } from "@/modules/auth/auth.types";

export function DashboardScreen({ account }: { account: Account }) {
  const { t, language } = useLanguage();
  const scope = `${account.id}:dashboard:`;
  const [period, setPeriod] = usePageState<DashboardPeriod>(`${scope}period`, "thisMonth");
  const [search, setSearch] = usePageState(`${scope}search`, "");
  const [showAll, setShowAll] = usePageState(`${scope}showAll`, false);
  const [dialog, setDialog] = useState<MessageKey | null>(null);
  const snapshot = periodPreviews[period];
  const query = search.trim().toLocaleLowerCase();
  const matchingDonations = donationPreviews.filter((donation) => donation.period === period
    && `${donation.name} ${donation.place} ${t(donation.mode)} ${t(donation.status)}`
      .toLocaleLowerCase().includes(query));
  const visibleDonations = showAll ? matchingDonations : matchingDonations.slice(0, 4);
  const stats: { label: MessageKey; value: string; icon: typeof Wallet;
    caption: MessageKey; primary?: boolean }[] = [
    { label: period === "thisMonth" ? "collectionMonth" : "collectionLastMonth",
      value: formatCurrency(snapshot.total), icon: Wallet, caption: "versusLastMonth", primary: true },
    { label: "booksWithCollectors", value: "8", icon: BookOpen, caption: "activeAssignments" },
    { label: "totalDonors", value: "60", icon: Users, caption: "acrossAllYears" },
    { label: "openFlags", value: "3", icon: Flag, caption: "requiresReview" },
  ];
  const attention = [
    { label: "overdueBooks", description: "overdueDescription", icon: BookOpen, warning: false },
    { label: "openFlags", description: "flagsDescription", icon: Flag, warning: true },
    { label: "pendingApprovals", description: "approvalsDescription", icon: ClipboardCheck, warning: false },
  ] as const;

  return (
    <AppShell account={account} search={search} onSearchChange={setSearch}>
      <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}>
        <div>
          <h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("dashboard")}</h1>
          <p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("dashboardDate")}</p>
        </div>
        <div className={"header-actions flex items-center gap-[12px]"}>
          <label className={"period-select flex items-center gap-[10px] p-[0_13px] min-h-[44px] bg-[var(--card)] [border:1px_solid_var(--border)] rounded-[var(--radius-control)] [&_select]:bg-[transparent] [&_select]:[border:0] [&_select]:text-[color:var(--foreground)] [&_select]:p-[9px_6px]"}>
            <CalendarDays size={17} aria-hidden="true" />
            <select aria-label={t("date")} value={period} onChange={(event) => {
              setPeriod(event.target.value === "lastMonth" ? "lastMonth" : "thisMonth");
              setShowAll(false);
            }}>
              <option value="thisMonth">{t("thisMonth")}</option>
              <option value="lastMonth">{t("lastMonth")}</option>
            </select>
          </label>
          <Button onClick={() => setDialog("addDonation")}>
            <Plus size={19} aria-hidden="true" />{t("addDonation")}
          </Button>
        </div>
      </div>

      <div className={"stats-grid grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-[var(--space-gap)]"}>
        {stats.map((stat) => (
          <Card key={stat.label} className={`stat-card p-[var(--space-panel)] min-h-[172px] ${stat.primary ? "stat-primary bg-[var(--primary)] text-[color:var(--primary-foreground)] [border-color:var(--primary)] [&_.stat-caption]:text-[color:var(--primary-foreground)]" : ""}`}>
            <span className={"stat-icon inline-flex items-center justify-center w-[40px] h-[40px] bg-[var(--primary-soft)] text-[color:var(--primary)] rounded-[50%]"}><stat.icon size={21} aria-hidden="true" /></span>
            <span className={"stat-label block text-[length:12px] mt-[13px]"}>{t(stat.label)}</span>
            <strong className={"stat-value block text-[length:33px] tracking-[-1px] font-bold mt-[6px] numeric tabular-nums"} dir="ltr">{stat.value}</strong>
            <p className={"stat-caption flex items-center gap-[6px] mt-[10px] text-[length:11px] text-[color:var(--muted-foreground)]"}>
              {stat.primary && period === "thisMonth" && <><ArrowUp size={13} />12%</>}
              {t(stat.caption)}
            </p>
          </Card>
        ))}
      </div>

      <div className={"dashboard-grid grid grid-cols-[minmax(0,_1.65fr)_minmax(340px,_1fr)] gap-[var(--space-gap)] mt-[var(--space-gap)] items-stretch"}>
        <DashboardCharts period={period} accountId={account.id} />
        <Card className={"panel p-[var(--space-panel)] min-w-0"}>
          <div className={"panel-header flex items-center justify-between gap-[12px]"}>
            <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}><Clock3 size={21} />{t("recentDonations")}</h2>
            <button type="button" className={"text-link text-[color:var(--primary)] bg-[transparent] [border:0] p-[5px_0] inline-flex gap-[6px] items-center text-[length:11px] font-semibold"} onClick={() => setShowAll(!showAll)}>
              {t(showAll ? "showLess" : "viewAll")}<ArrowRight size={14} className={"directional-icon [html[dir='rtl']_&]:[transform:scaleX(-1)]"} />
            </button>
          </div>
          <div className={"table-container overflow-x-auto mt-[18px] [scrollbar-width:thin] [scrollbar-color:var(--emerald-300)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--emerald-300)]"}>
            <table className={"data-table w-full border-collapse text-start [&_th]:text-[length:10px] [&_th]:text-[color:var(--muted-foreground)] [&_th]:font-normal [&_th]:text-start [&_th]:p-[0_8px_12px] [&_td]:[border-top:1px_solid_var(--border)] [&_td]:p-[13px_8px] [&_td]:text-[length:11px] [&_th:first-child]:ps-0 [&_td:first-child]:ps-0 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0 [&_th.amount-cell]:text-end"}>
              <thead><tr>{(["donor", "amount", "mode", "date", "status"] as const).map((key) => (
                <th key={key} scope="col" className={key === "amount" ? "amount-cell whitespace-nowrap text-end" : ""}>{t(key)}</th>
              ))}</tr></thead>
              <tbody>
                {visibleDonations.map((donation) => (
                  <tr key={donation.id}>
                    <td><span className={"donor-name font-semibold whitespace-nowrap"}>{donation.name}</span>
                      <span className={"donor-place block text-[color:var(--muted-foreground)] mt-[5px] text-[length:10px]"}>{donation.place}</span></td>
                    <td className={"amount-cell whitespace-nowrap text-end numeric tabular-nums"} dir="ltr">{formatCurrency(donation.amount)}</td>
                    <td><Badge tone={donation.mode === "cash" ? "neutral" : "success"}>{t(donation.mode)}</Badge></td>
                    <td className={"muted text-[color:var(--muted-foreground)] numeric tabular-nums"}><time dateTime={donation.date}>
                      {new Intl.DateTimeFormat(language === "ur" ? "ur-IN-u-nu-latn" : "en-IN", {
                        day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
                      }).format(new Date(`${donation.date}T00:00:00+05:30`))}
                    </time></td>
                    <td><Badge tone={donation.status === "pending" ? "warning" : "success"}>
                      {t(donation.status)}</Badge></td>
                  </tr>
                ))}
                {visibleDonations.length === 0 && <tr><td colSpan={5}>{t("noResults")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className={"panel p-[var(--space-panel)] min-w-0"}>
          <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}><TriangleAlert size={22} />{t("needsAttention")}</h2>
          <div className={"attention-list mt-[20px]"}>
            {attention.map(({ label, description, icon: Icon, warning }) => (
              <button key={label} type="button" className={"attention-row flex items-center gap-[12px] w-full p-[17px_0] bg-[transparent] text-[color:var(--foreground)] [border:0] [border-top:1px_solid_var(--border)] text-start [&:first-child]:[border-top:0]"} onClick={() => setDialog(label)}>
                <span className={`attention-icon flex items-center justify-center w-[43px] h-[43px] rounded-[50%] bg-[var(--danger-soft)] text-[color:var(--danger)] ${warning ? "attention-warning bg-[var(--warning-soft)] text-[color:var(--warning)]" : ""}`}>
                  <Icon size={21} aria-hidden="true" /></span>
                <span className={"attention-text flex-1 [&_strong]:block [&_strong]:text-[length:12px] [&_strong]:font-semibold [&_small]:block [&_small]:text-[color:var(--muted-foreground)] [&_small]:mt-[6px] [&_small]:text-[length:10px]"}><strong>{t(label)}</strong><small>{t(description)}</small></span>
                <span className={"attention-count rounded-[var(--radius-pill)] bg-[var(--danger-soft)] text-[color:var(--danger)] min-w-[36px] text-center p-[4px_10px] text-[length:12px] numeric tabular-nums"}>3</span>
                <ChevronRight size={16} className={"muted text-[color:var(--muted-foreground)] directional-icon [html[dir='rtl']_&]:[transform:scaleX(-1)]"} aria-hidden="true" />
              </button>
            ))}
          </div>
        </Card>
      </div>
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}
        title={dialog ? t(dialog) : ""} description={t("moduleLater")} />
    </AppShell>
  );
}
