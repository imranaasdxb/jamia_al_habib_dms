"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { sessionFetch } from "@/lib/auth/session-fetch";
import { bookExportStatuses } from "@/modules/books/book-export.schema";
import type { BookExportQuery, BookExportStatus } from "@/modules/books/book-export.schema";
import type { MessageKey } from "@/lib/i18n/messages";

type ExportFilters = Partial<Pick<BookExportQuery, "search" | "collectorId" | "bookType" | "editionId" | "tab" | "tokenValue" | "stockStatus">>;
const statusLabels: Record<BookExportStatus, MessageKey> = {
  ALL: "booksAllOptions", OPEN: "assignOpen", IN_PROGRESS: "submissionInProgress", OVERDUE: "assignOverdue",
  CLOSED: "booksClosed", REOPENED: "submissionStatusReopened", NOT_USED: "booksNotUsed", FLAGGED: "booksFlagged",
};

export function BookExportButton({ source, filters = {}, initialStatus = "ALL", disabled = false }: {
  source: BookExportQuery["source"]; filters?: ExportFilters; initialStatus?: string; disabled?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false); const [exporting, setExporting] = useState(false);
  const [statuses, setStatuses] = useState<BookExportStatus[]>(["ALL"]);
  const [error, setError] = useState<MessageKey | null>(null);
  function show() {
    const value = initialStatus === "NOT_STARTED" ? "OPEN" : initialStatus === "RECONCILED" ? "CLOSED" : initialStatus;
    setStatuses([bookExportStatuses.find((status) => status === value) ?? "ALL"]);
    setError(null); setOpen(true);
  }
  function toggle(status: BookExportStatus) {
    setStatuses((previous) => status === "ALL" ? ["ALL"] : previous.includes(status)
      ? previous.filter((value) => value !== status) : [...previous.filter((value) => value !== "ALL"), status]);
    setError(null);
  }
  async function download() {
    if (exporting || !statuses.length) return;
    setExporting(true); setError(null);
    try {
      const params = new URLSearchParams({ source, statuses: statuses.join(",") });
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) params.set(key, value);
      }
      const response = await sessionFetch(`/api/v1/books/export?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const details = typeof payload === "object" && payload !== null && "error" in payload ? payload.error : null;
        const code = typeof details === "object" && details !== null && "code" in details ? details.code : "";
        setError(code === "BOOK_EXPORT_TOO_LARGE" ? "bookExportTooLarge" : code === "BOOK_EXPORT_EMPTY" ? "bookExportEmpty"
          : code === "ACCESS_DENIED" ? "authDenied" : code === "SESSION_EXPIRED" ? "authExpired" : "bookExportFailed");
        return;
      }
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "jah-book-records.xlsx";
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setOpen(false);
    } catch { setError("bookExportFailed"); }
    finally { setExporting(false); }
  }
  return <>
    <Button className="min-h-[47px] shrink-0 whitespace-nowrap" disabled={disabled} onClick={show}><Download size={16} aria-hidden="true" />{t("bookExportAction")}</Button>
    <Dialog open={open} busy={exporting} onOpenChange={setOpen} title={t("bookExport")} description={t(source === "STOCK" ? "bookStockExportHelp" : "bookExportHelp")}>
      {source !== "STOCK" && <fieldset disabled={exporting} className="mt-4 min-w-0">
        <legend className="mb-3 text-xs font-semibold">{t("status")}</legend>
        <div className="grid grid-cols-2 gap-2">{bookExportStatuses.map((status) => <label key={status}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs has-checked:border-primary has-checked:bg-accent/40">
          <input type="checkbox" className="size-4 accent-primary" checked={statuses.includes(status)} onChange={() => toggle(status)} />{t(statusLabels[status])}
        </label>)}</div>
      </fieldset>}
      {source !== "STOCK" && <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{t("bookExportScope")}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{t(error)}</p>}
      <div className="mt-5 flex justify-end"><Button loading={exporting} disabled={!statuses.length} onClick={() => { void download(); }}>
        <Download size={16} aria-hidden="true" />{t("bookExportDownload")}
      </Button></div>
    </Dialog>
  </>;
}
