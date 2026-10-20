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
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("dashboard")}</h1>
          <p className="page-subtitle">{t("dashboardDate")}</p>
        </div>
        <div className="header-actions">
          <label className="period-select">
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

      <div className="stats-grid">
        {stats.map((stat) => (
          <Card key={stat.label} className={`stat-card ${stat.primary ? "stat-primary" : ""}`}>
            <span className="stat-icon"><stat.icon size={21} aria-hidden="true" /></span>
            <span className="stat-label">{t(stat.label)}</span>
            <strong className="stat-value numeric" dir="ltr">{stat.value}</strong>
            <p className="stat-caption">
              {stat.primary && period === "thisMonth" && <><ArrowUp size={13} />12%</>}
              {t(stat.caption)}
            </p>
          </Card>
        ))}
      </div>

      <div className="dashboard-grid">
        <DashboardCharts period={period} accountId={account.id} />
        <Card className="panel">
          <div className="panel-header">
            <h2 className="panel-title"><Clock3 size={21} />{t("recentDonations")}</h2>
            <button type="button" className="text-link" onClick={() => setShowAll(!showAll)}>
              {t(showAll ? "showLess" : "viewAll")}<ArrowRight size={14} className="directional-icon" />
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead><tr>{(["donor", "amount", "mode", "date", "status"] as const).map((key) => (
                <th key={key} scope="col" className={key === "amount" ? "amount-cell" : ""}>{t(key)}</th>
              ))}</tr></thead>
              <tbody>
                {visibleDonations.map((donation) => (
                  <tr key={donation.id}>
                    <td><span className="donor-name">{donation.name}</span>
                      <span className="donor-place">{donation.place}</span></td>
                    <td className="amount-cell numeric" dir="ltr">{formatCurrency(donation.amount)}</td>
                    <td><Badge tone={donation.mode === "cash" ? "neutral" : "success"}>{t(donation.mode)}</Badge></td>
                    <td className="muted numeric"><time dateTime={donation.date}>
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
        <Card className="panel">
          <h2 className="panel-title"><TriangleAlert size={22} />{t("needsAttention")}</h2>
          <div className="attention-list">
            {attention.map(({ label, description, icon: Icon, warning }) => (
              <button key={label} type="button" className="attention-row" onClick={() => setDialog(label)}>
                <span className={`attention-icon ${warning ? "attention-warning" : ""}`}>
                  <Icon size={21} aria-hidden="true" /></span>
                <span className="attention-text"><strong>{t(label)}</strong><small>{t(description)}</small></span>
                <span className="attention-count numeric">3</span>
                <ChevronRight size={16} className="muted directional-icon" aria-hidden="true" />
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
