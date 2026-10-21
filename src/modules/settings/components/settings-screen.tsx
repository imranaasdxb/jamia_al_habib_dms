"use client";

import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Clock3, RefreshCw, Save } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { AppShell } from "@/components/layout/app-shell";
import { usePageDataCache, usePageQuery } from "@/components/page-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AuthField } from "@/modules/auth/components/auth-field";
import { saveSettingsSchema, settingsResponseSchema } from "@/modules/settings/settings.schema";
import type { Account } from "@/modules/auth/auth.types";
import type { MessageKey } from "@/lib/i18n/messages";
import type { SaveSettingsValues, SettingsData } from "@/modules/settings/settings.schema";

async function settingsRequest(body?: SaveSettingsValues): Promise<SettingsData> {
  const response = await fetch("/api/v1/settings", { cache: "no-store",
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "authDenied"
    : response.status === 409 ? "settingsStale" : "settingsFailed");
  return settingsResponseSchema.parse(await response.json()).data;
}

function settingsError(error: unknown): MessageKey {
  return error instanceof Error && error.message === "authDenied" ? "authDenied"
    : error instanceof Error && error.message === "settingsStale" ? "settingsStale" : "settingsFailed";
}

function SettingsForm({ data, onSaved, onBusyChange }: { data: SettingsData;
  onSaved: (data: SettingsData) => void; onBusyChange: (busy: boolean) => void }) {
  const { t } = useLanguage();
  const [error, setError] = useState<MessageKey | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty, isValid } } = useForm<SaveSettingsValues>({
    resolver: zodResolver(saveSettingsSchema), mode: "onChange",
    defaultValues: { sessionTimeoutMinutes: data.sessionTimeoutMinutes,
      defaultReturnMonths: data.defaultReturnMonths, version: data.updatedAt, reason: "" },
  });
  async function submit(values: SaveSettingsValues) {
    setError(null); onBusyChange(true);
    try { onSaved(await settingsRequest(values)); }
    catch (error) { setError(settingsError(error)); }
    finally { onBusyChange(false); }
  }
  return <form className={"settings-form grid gap-[var(--space-gap)] max-w-[1100px]"} noValidate onSubmit={handleSubmit(submit)}>
    <fieldset disabled={isSubmitting} className={"settings-fields [border:0] p-0 m-0 min-w-0 grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[var(--space-gap)] max-[800px]:grid-cols-[1fr]"}>
      <Card className={"settings-panel p-[26px] [&_.panel-title]:mb-[12px] [&_.panel-title_svg]:text-[color:var(--primary)] [&_.input]:min-h-[44px]"}>
        <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}><Clock3 size={20} aria-hidden="true" />{t("settingsSession")}</h2>
        <p className={"settings-help text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] mb-[24px]"}>{t("settingsSessionHelp")}</p>
        <AuthField id="settings-timeout" label={t("settingsTimeout")} type="number" min={5} max={480} step={1}
          required hint={t("settingsTimeoutHint")} error={errors.sessionTimeoutMinutes ? t("settingsTimeoutInvalid") : undefined}
          {...register("sessionTimeoutMinutes", { valueAsNumber: true })} />
      </Card>
      <Card className={"settings-panel p-[26px] [&_.panel-title]:mb-[12px] [&_.panel-title_svg]:text-[color:var(--primary)] [&_.input]:min-h-[44px]"}>
        <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}><CalendarDays size={20} aria-hidden="true" />{t("settingsBooks")}</h2>
        <p className={"settings-help text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] mb-[24px]"}>{t("settingsBooksHelp")}</p>
        <AuthField id="settings-return-months" label={t("settingsReturnMonths")} type="number" min={1} max={60} step={1}
          required hint={t("settingsReturnHint")} error={errors.defaultReturnMonths ? t("settingsReturnInvalid") : undefined}
          {...register("defaultReturnMonths", { valueAsNumber: true })} />
      </Card>
      <Card className={"settings-panel p-[26px] [&_.panel-title]:mb-[12px] [&_.panel-title_svg]:text-[color:var(--primary)] [&_.input]:min-h-[44px] settings-change col-[1_/_-1]"}>
        <h2 className={"panel-title flex items-center gap-[11px] text-[length:16px] font-[650] [&_>_svg]:text-[color:var(--primary)]"}>{t("settingsChange")}</h2>
        <AuthField id="settings-reason" label={t("settingsReason")} required maxLength={500}
          hint={t("settingsReasonHint")} error={errors.reason ? t("settingsReasonInvalid") : undefined} {...register("reason")} />
      </Card>
    </fieldset>
    {error && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(error)}</p>}
    <div className={"settings-save flex justify-end"}><Button type="submit" loading={isSubmitting} disabled={!isDirty || !isValid}>
      <Save size={17} aria-hidden="true" />{t(isSubmitting ? "usersSaving" : "settingsSave")}</Button></div>
  </form>;
}

export function SettingsScreen({ account }: { account: Account }) {
  const { t } = useLanguage();
  const cache = usePageDataCache();
  const key = `${account.id}:settings:query`;
  const fetchSettings = useCallback(() => settingsRequest(), []);
  const query = usePageQuery(key, fetchSettings);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const loading = query.loading || query.stale;
  return <AppShell account={account} headerTitle="settings" sampleData={false} search="" onSearchChange={() => {}}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}><div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("settings")}</h1>
      <p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("settingsDescription")}</p></div>
      <Button variant="outline" loading={loading} disabled={busy} onClick={() => { setSaved(false); cache.invalidate(key); }}>
        <RefreshCw size={17} aria-hidden="true" />{t("usersRefresh")}</Button></div>
    {saved && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] settings-notice mb-[var(--space-gap)]"} role="status">{t("settingsSaved")}</p>}
    {query.error != null && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(settingsError(query.error))}</p>}
    {loading && !query.data && <Card className={"settings-panel p-[26px] [&_.panel-title]:mb-[12px] [&_.panel-title_svg]:text-[color:var(--primary)] [&_.input]:min-h-[44px]"} role="status">{t("working")}</Card>}
    {query.data && <SettingsForm key={query.data.updatedAt} data={query.data} onBusyChange={setBusy} onSaved={(data) => {
      cache.setQueryData(key, data);
      cache.setQueryData(`${account.id}:assignments:defaults`, { data: { returnMonths: data.defaultReturnMonths } });
      cache.write(`${account.id}:settings:session-timeout`, data.sessionTimeoutMinutes);
      setSaved(true);
    }} />}
  </AppShell>;
}
