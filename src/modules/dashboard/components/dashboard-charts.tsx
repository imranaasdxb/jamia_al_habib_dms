"use client";
import { memo } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined, Wallet } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Card } from "@/components/ui/card";
import { displayMoney } from "@/modules/books/returns.schema";
import type { ChartInterval, DashboardData } from "@/modules/dashboard/dashboard.schema";

export const DashboardCharts = memo(function DashboardCharts({ data, trend, interval, onInterval, loading, trendLoading }: {
  data?: DashboardData; trend?: DashboardData["trend"]; interval: ChartInterval;
  onInterval: (interval: ChartInterval) => void; loading: boolean; trendLoading: boolean;
}) {
  const { t, language } = useLanguage(); const locale = language === "ur" ? "ur-IN" : "en-IN";
  const money = (value: number) => displayMoney(value, language);
  const points = trend?.map((point) => ({ amountPaise: point.amountPaise, label: new Intl.DateTimeFormat(locale, {
    ...(interval === "yearly" ? { year: "numeric" as const } : interval === "monthly"
      ? { month: "short" as const, year: "2-digit" as const } : { day: "2-digit" as const, month: "short" as const }), timeZone: "UTC",
  }).format(new Date(`${point.date}T00:00:00Z`)) })) ?? [];
  const payments = data ? [
    { name: t("receiptCash"), value: data.collection.cashPaise, color: "var(--chart-primary)" },
    { name: t("receiptDigital"), value: data.collection.digitalPaise, color: "var(--chart-secondary)" },
    { name: t("receiptCheque"), value: data.collection.chequePaise, color: "#d49b38" },
  ] : [];
  const total = data?.collection.collectedPaise ?? 0;
  return <>
    <Card className="min-w-0 rounded-[18px] p-5 xl:col-span-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><ChartNoAxesCombined size={18} className="text-primary" />{t("collectionsTrend")}</h2>
        <div className="inline-flex gap-1 rounded-full bg-muted p-1" aria-label={t("collectionsTrend")}>{(["monthly", "weekly", "yearly"] as const).map((value) => <button key={value} type="button" aria-pressed={interval === value} onClick={() => onInterval(value)} className="rounded-full px-3 py-1.5 text-[10px] text-muted-foreground transition-colors hover:text-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">{t(value)}</button>)}</div>
      </div><p className="mt-2 text-[11px] text-muted-foreground">{t("dashboardTrendScope")}</p>
      <div className="mt-4 h-[250px] w-full [direction:ltr]" aria-busy={trendLoading || undefined} role="img" aria-label={t("collectionsTrend")}>
        {trendLoading ? <div className="h-full animate-pulse rounded-xl bg-muted" /> : points.some((point) => point.amountPaise > 0) ? <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickMargin={10} minTickGap={22} />
            <YAxis axisLine={false} tickLine={false} width={65} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={(value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(value / 100)} />
            <Tooltip formatter={(value) => [money(Number(value)), t("collection")]} contentStyle={{ background: "var(--card)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: "12px" }} />
            <Area type="monotone" dataKey="amountPaise" stroke="var(--chart-primary)" strokeWidth={2.5} fill="var(--chart-fill)" dot={{ r: 3, fill: "var(--chart-primary)" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl bg-muted/30 text-xs text-muted-foreground">{t("dashboardNoReceipts")}</div>}
      </div>
    </Card>
    <Card className="min-w-0 rounded-[18px] p-5 xl:col-span-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Wallet size={18} className="text-primary" />{t("paymentBreakdown")}</h2>
      <div className="mt-4 flex flex-col items-center gap-4" aria-busy={loading || undefined}>
        <div className="relative size-[190px] [direction:ltr]" role="img" aria-label={t("paymentBreakdown")}>
          {loading ? <div className="size-full animate-pulse rounded-full border-[22px] border-muted" /> : total > 0 ? <PieChart width={190} height={190}>
            <Pie data={payments.filter((payment) => payment.value > 0)} dataKey="value" nameKey="name" innerRadius={61} outerRadius={88} startAngle={90} endAngle={-270} paddingAngle={2} stroke="var(--card)" isAnimationActive={false}>
              {payments.filter((payment) => payment.value > 0).map((payment) => <Cell key={payment.name} fill={payment.color} />)}
            </Pie><Tooltip formatter={(value) => money(Number(value))} />
          </PieChart> : <div className="size-full rounded-full border-[22px] border-muted" />}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="max-w-[122px] break-words text-center text-base font-semibold tabular-nums">{data ? money(total) : "—"}</strong><span className="mt-1 text-[10px] text-muted-foreground">{t("total")}</span></div>
        </div>
        <div className="w-full space-y-2.5">{payments.map((payment) => <div key={payment.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: payment.color }} />{payment.name}</span><span className="text-end"><strong className="font-medium tabular-nums">{money(payment.value)}</strong><span className="ms-2 text-[10px] text-muted-foreground">{total > 0 ? Math.round(payment.value / total * 100) : 0}%</span></span></div>)}</div>
      </div>
    </Card>
  </>;
});
