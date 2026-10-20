import type { MessageKey } from "@/lib/i18n/messages";

export type DashboardPeriod = "thisMonth" | "lastMonth";
export type ChartInterval = "monthly" | "weekly" | "yearly";

interface DonationPreview {
  id: string;
  name: string;
  place: string;
  amount: number;
  mode: "cash" | "digital";
  date: string;
  period: DashboardPeriod;
  status: "verified" | "pending" | "recorded";
}

export const donationPreviews: DonationPreview[] = [
  { id: "1", name: "Mohammed Saif Khan", place: "Rasulpur, Odisha", amount: 25000,
    mode: "digital", date: "2026-10-19", period: "thisMonth", status: "verified" },
  { id: "2", name: "Ayesha Begum", place: "Cuttack, Odisha", amount: 10000,
    mode: "cash", date: "2026-10-19", period: "thisMonth", status: "recorded" },
  { id: "3", name: "Abdul Rahman", place: "Kendrapara, Odisha", amount: 50000,
    mode: "digital", date: "2026-10-18", period: "thisMonth", status: "pending" },
  { id: "4", name: "Mohammed Imran", place: "Puri, Odisha", amount: 5000,
    mode: "cash", date: "2026-10-17", period: "thisMonth", status: "recorded" },
  { id: "5", name: "Farida Bibi", place: "Jagatsinghpur, Odisha", amount: 15000,
    mode: "digital", date: "2026-10-16", period: "thisMonth", status: "verified" },
  { id: "6", name: "Yusuf Ali", place: "Rasulpur, Odisha", amount: 20000,
    mode: "cash", date: "2026-10-15", period: "thisMonth", status: "recorded" },
  { id: "7", name: "Rashid Khan", place: "Cuttack, Odisha", amount: 18000,
    mode: "digital", date: "2026-09-29", period: "lastMonth", status: "verified" },
  { id: "8", name: "Salim Ahmed", place: "Puri, Odisha", amount: 12000,
    mode: "cash", date: "2026-09-28", period: "lastMonth", status: "recorded" },
];

export const periodPreviews = {
  thisMonth: { total: 482000, cash: 310000, digital: 172000 },
  lastMonth: { total: 430000, cash: 280000, digital: 150000 },
} satisfies Record<DashboardPeriod, { total: number; cash: number; digital: number }>;

export const monthlyPreviews: { label: MessageKey; amount: number }[] = [
  { label: "apr", amount: 82000 },
  { label: "may", amount: 168000 },
  { label: "jun", amount: 142000 },
  { label: "jul", amount: 286000 },
  { label: "aug", amount: 354000 },
  { label: "sep", amount: 430000 },
  { label: "oct", amount: 482000 },
];
