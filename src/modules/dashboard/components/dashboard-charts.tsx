"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined, Wallet } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageState } from "@/components/page-data-provider";
import { Card } from "@/components/ui/card";
import { monthlyPreviews, periodPreviews } from "@/modules/dashboard/dashboard.data";
import { formatCurrency } from "@/lib/utils";
import type { ChartInterval, DashboardPeriod } from "@/modules/dashboard/dashboard.data";

export function DashboardCharts({ period, accountId }: { period: DashboardPeriod; accountId: string }) {
  const { t } = useLanguage();
  const [interval, setInterval] = usePageState<ChartInterval>(`${accountId}:dashboard:interval`, "monthly");
  const snapshot = periodPreviews[period];
  const monthly = (period === "lastMonth" ? monthlyPreviews.slice(0, -1) : monthlyPreviews)
    .map((point) => ({ label: t(point.label), amount: point.amount }));
  const weekly = [0.22, 0.36, 0.42].map((share, index) => ({
    label: t(index === 0 ? "weekOne" : index === 1 ? "weekTwo" : "weekThree"),
    amount: Math.round(snapshot.total * share),
  }));
  const yearly = [
    { label: "2024–25", amount: 2480000 },
    { label: "2025–26", amount: 3820000 },
    { label: "2026–27", amount: monthly.reduce((sum, point) => sum + point.amount, 0) },
  ];
  const points = interval === "monthly" ? monthly : interval === "weekly" ? weekly : yearly;
  const payments = [
    { name: t("cash"), value: snapshot.cash, color: "var(--chart-primary)" },
    { name: t("digital"), value: snapshot.digital, color: "var(--chart-secondary)" },
  ];

  return (
    <>
      <Card className={"panel p-[var(--space-panel)] min-w-0"}>
        <div className={"panel-header flex items-center justify-between gap-[12px]"}>
          <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}><ChartNoAxesCombined size={21} />{t("collectionsTrend")}</h2>
          <div className={"segmented-control inline-flex gap-[2px] bg-[var(--muted)] p-[3px] rounded-[var(--radius-pill)] [&_button]:[border:0] [&_button]:bg-[transparent] [&_button]:text-[color:var(--muted-foreground)] [&_button]:p-[8px_11px] [&_button]:text-[length:10px] [&_button]:rounded-[var(--radius-pill)] [&_button[aria-pressed='true']]:bg-[var(--primary)] [&_button[aria-pressed='true']]:text-[color:var(--primary-foreground)]"} aria-label={t("collectionsTrend")}>
            {(["monthly", "weekly", "yearly"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={interval === value}
                onClick={() => setInterval(value)}>{t(value)}</button>
            ))}
          </div>
        </div>
        <div className={"chart-summary mt-[21px] [&_strong]:block [&_strong]:text-[length:31px] [&_strong]:tracking-[-1px] [&_p]:text-[color:var(--muted-foreground)] [&_p]:mt-[4px] [&_p]:text-[length:12px]"}>
          <strong className={"numeric tabular-nums"} dir="ltr">{formatCurrency(snapshot.total)}</strong>
          <p>{t(period === "thisMonth" ? "collectionMonth" : "collectionLastMonth")}</p>
        </div>
        <div className={"trend-chart w-full h-[222px] mt-[16px] [direction:ltr]"} role="img" aria-label={t("collectionsTrend")}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickMargin={12} />
              <YAxis axisLine={false} tickLine={false} width={58}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value: number) => value >= 100000
                  ? `₹${(value / 100000).toFixed(1)}L` : `₹${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), t("collection")]}
                contentStyle={{ background: "var(--card)", color: "var(--foreground)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-control)" }} />
              <Area type="monotone" dataKey="amount" stroke="var(--chart-primary)"
                strokeWidth={2.5} fill="var(--chart-fill)" dot={{ r: 3, fill: "var(--chart-primary)" }}
                isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className={"panel p-[var(--space-panel)] min-w-0"}>
        <div className={"panel-header flex items-center justify-between gap-[12px]"}>
          <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}><Wallet size={21} />{t("paymentBreakdown")}</h2>
          <span className={"muted text-[color:var(--muted-foreground)] text-xs"}>{t(period)}</span>
        </div>
        <div className={"payment-content flex items-center justify-between gap-[10px] min-h-[290px]"}>
          <div className={"payment-chart relative w-[205px] h-[205px] [direction:ltr]"} role="img" aria-label={t("paymentBreakdown")}>
            <PieChart width={205} height={205}>
              <Pie data={payments} dataKey="value" nameKey="name" innerRadius={64}
                outerRadius={96} startAngle={90} endAngle={-270} paddingAngle={2}
                stroke="var(--card)" isAnimationActive={false}>
                {payments.map((payment) => <Cell key={payment.name} fill={payment.color} />)}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            </PieChart>
            <div className={"donut-total absolute inset-0 flex flex-col items-center justify-center pointer-events-none [&_strong]:text-[length:20px] [&_strong]:tracking-[-.6px] [&_span]:mt-[5px] [&_span]:text-[length:11px] [&_span]:text-[color:var(--muted-foreground)]"}>
              <strong className={"numeric tabular-nums"} dir="ltr">{formatCurrency(snapshot.total)}</strong>
              <span>{t("total")}</span>
            </div>
          </div>
          <div className={"payment-legend flex flex-col gap-[28px] pe-[5px]"}>
            {payments.map((payment, index) => (
              <div key={payment.name}>
                <span className={"legend-label flex gap-[9px] items-center text-[length:12px]"}><span className={index === 0
                  ? "legend-dot w-[10px] h-[10px] rounded-[50%] bg-[var(--chart-primary)]" : "legend-dot w-[10px] h-[10px] rounded-[50%] bg-[var(--chart-primary)] legend-dot-secondary bg-[var(--chart-secondary)]"} />{payment.name}</span>
                <strong className={"legend-value block ms-[19px] font-[650] mt-[7px] numeric tabular-nums"} dir="ltr">{formatCurrency(payment.value)}</strong>
                <p className={"legend-percentage ms-[19px] mt-[5px] text-[color:var(--muted-foreground)] text-[length:11px] numeric tabular-nums"}>{Math.round(payment.value / snapshot.total * 100)}%</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}
