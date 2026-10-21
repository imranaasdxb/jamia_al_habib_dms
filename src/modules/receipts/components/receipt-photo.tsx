"use client";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { receiptError, receiptRequest } from "@/modules/receipts/receipts.client";
import { receiptRecordResponseSchema } from "@/modules/receipts/receipts.schema";
import type { ReceiptRecord } from "@/modules/receipts/receipts.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export function ReceiptPhoto({ record, locked, onSaved, onBusy }: { record: ReceiptRecord | null; locked: boolean; onSaved: (row: ReceiptRecord) => void; onBusy: (value: boolean) => void }) {
  const { t } = useLanguage(); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function save(remove: boolean) {
    if (!record || busy) return; setBusy(true); onBusy(true); setError(null);
    try {
      const result = receiptRecordResponseSchema.parse(await receiptRequest(`/api/v1/receipt-entry/photos/${record.id}`, { method: remove ? "DELETE" : "POST",
        headers: { "x-receipt-version": String(record.version), ...(!remove && file ? { "Content-Type": file.type } : {}) }, body: remove ? undefined : file }));
      onSaved(result.data); setFile(null);
    } catch (failure) { setError(receiptError(failure)); } finally { setBusy(false); onBusy(false); }
  }
  const source = preview || (record?.hasPhoto ? `/api/v1/receipt-entry/photos/${record.id}?v=${record.version}` : "");
  return <section className="space-y-3 rounded-xl border border-border p-4"><h3 className="text-sm font-semibold">{t("receiptPhoto")}</h3>
    {!record && <p className="text-xs text-muted-foreground">{t("receiptPhotoSaveFirst")}</p>}
    {source && <a href={source} target="_blank" rel="noreferrer"><img src={source} alt={t("receiptPhoto")} className="max-h-64 max-w-full rounded-lg object-contain" /></a>}
    {record && !locked && <><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="block w-full text-xs file:me-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-primary" onChange={(event) => {
      const next = event.target.files?.[0] ?? null; if (next && (next.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(next.type))) { setError("receiptPhotoInvalid"); return; }
      setFile(next); setError(null);
    }} /><div className="flex gap-2"><Button size="small" variant="outline" loading={busy} disabled={!file} onClick={() => { void save(false); }}>{t("receiptUploadPhoto")}</Button>
      {record.hasPhoto && <Button size="small" variant="ghost" disabled={busy} onClick={() => { void save(true); }}>{t("assignRemove")}</Button>}</div></>}
    {error && <p className="text-xs text-[var(--danger)]" role="alert">{t(error)}</p>}
  </section>;
}
