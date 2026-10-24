"use client";
import { sessionFetch } from "@/lib/auth/session-fetch";

import { useCallback, useState } from "react";
import { Plus, RefreshCw, Search, SlidersHorizontal, Users } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { usePageDataCache, usePageQuery, usePageState } from "@/components/page-data-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CreateUserForm } from "@/modules/users/components/create-user-form";
import { UserProfileCard } from "@/modules/users/components/user-profile-card";
import { usersResponseSchema } from "@/modules/users/users.schema";
import { userErrorMessage, userMutationChanged, usersRequest } from "@/modules/users/users.client";
import type { UsersQuery } from "@/modules/users/users.schema";
import type { UsersPageData, UserRow } from "@/modules/users/users.types";
import type { Account } from "@/modules/auth/auth.types";
import type { MessageKey } from "@/lib/i18n/messages";

function reconcileUsers(previous: UsersPageData | undefined, next: UsersPageData): UsersPageData {
  const existing = new Map(previous?.users.map((user) => [user.id, user]));
  return { ...next, users: next.users.map((user) => {
    const cached = existing.get(user.id);
    return cached && JSON.stringify(cached) === JSON.stringify(user) ? cached : user;
  }) };
}

export function UsersScreen({ account }: { account: Account }) {
  const { t } = useLanguage();
  const cache = usePageDataCache();
  const scope = `${account.id}:users:`;
  const [search, setSearch] = usePageState(`${scope}search`, "");
  const [role, setRole] = usePageState<UsersQuery["role"]>(`${scope}role`, "ALL");
  const [page, setPage] = usePageState(`${scope}page`, 1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [blockTarget, setBlockTarget] = useState<UserRow | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const key = new URLSearchParams({ search: search.trim(), role, page: String(page) }).toString();
  const fetchUsers = useCallback(async () => {
    const response = await sessionFetch(`/api/v1/users?${key}`, { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "authDenied" : "usersLoadFailed");
    const payload = usersResponseSchema.parse(await response.json());
    return { users: payload.data, ...payload.meta };
  }, [key]);
  const query = usePageQuery(`${scope}query:${key}`, fetchUsers,
    { enabled: !open, delay: search ? 250 : 0, reconcile: reconcileUsers });
  const data = query.data;
  const loading = query.loading || query.stale;
  const error: MessageKey | null = query.error
    ? query.error instanceof Error && query.error.message === "authDenied" ? "authDenied" : "usersLoadFailed" : null;
  const invalidate = useCallback(() => { cache.invalidate(`${scope}query:`); }, [cache, scope]);
  const markChanged = invalidate;
  const editUser = useCallback((user: UserRow) => {
    setEditing(user); setViewing(null); setOpen(true);
  }, []);
  const viewUser = useCallback((user: UserRow) => { setViewing(user); }, []);
  const chooseBlock = useCallback((user: UserRow) => { setNotice(null); setBlockTarget(user); }, []);
  const finishEditor = useCallback(() => {
    setOpen(false); setFormBusy(false);
  }, []);

  async function changeBlock() {
    if (!blockTarget || blocking) return;
    setBlocking(true); setNotice(null);
    try {
      await usersRequest(`/api/v1/users/${blockTarget.id}`, { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", blocked: blockTarget.status !== "BLOCKED" }),
      });
      setNotice("usersSavedSuccess"); setBlockTarget(null); invalidate();
    } catch (error) { setNotice(userErrorMessage(error)); if (userMutationChanged(error)) invalidate(); }
    finally { setBlocking(false); }
  }

  return <AppShell account={account} search={search} sampleData={false} headerTitle="users"
    onSearchChange={setSearch}>
    <div className={"page-header flex justify-between items-center gap-[20px] mb-[22px]"}>
      <div><h1 className={"page-title text-[length:34px] font-bold tracking-[-1.3px] [html[lang='ur']_&]:tracking-0"}>{t("users")}</h1><p className={"page-subtitle text-[color:var(--muted-foreground)] mt-[7px]"}>{t("usersDescription")}</p></div>
      <Button onClick={() => { setEditing(null); setOpen(true); }}>
        <Plus size={18} aria-hidden="true" />{t("usersAdd")}</Button>
    </div>
    {notice && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] users-notice mb-[var(--space-gap)]"} role="status">{t(notice)}</p>}
    <Card className={"users-filter-bar flex items-center justify-between gap-[20px] p-[16px_20px]"}>
      <span className={"users-filter-label inline-flex items-center gap-[9px] font-semibold [&_svg]:text-[color:var(--primary)]"}><SlidersHorizontal size={18} aria-hidden="true" />{t("usersFilters")}</span>
      <div className={"users-filter-controls flex items-center justify-end gap-[10px] flex-1"}>
        <label className={"users-filter-search relative w-[min(100%,_370px)] [&_>_svg]:absolute [&_>_svg]:start-[13px] [&_>_svg]:top-[15px] [&_>_svg]:text-[color:var(--muted-foreground)] [&_.input]:ps-[39px]"}><Search size={17} aria-hidden="true" />
          <Input type="search" maxLength={100} aria-label={t("usersSearch")} placeholder={t("usersSearch")}
            value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <select className={"input block w-full min-h-[47px] p-[12px_14px] bg-[var(--card)] [border:1px_solid_var(--input)] rounded-[var(--radius-control)] text-[color:var(--foreground)] [transition:border-color_.15s] [&::placeholder]:text-[color:var(--muted-foreground)] [&[aria-invalid='true']]:[border-color:var(--danger)] users-filter-role w-[165px]"} aria-label={t("usersRole")} value={role}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "ALL" || value === "ADMIN" || value === "STAFF") { setRole(value); setPage(1); }
          }}><option value="ALL">{t("usersAllRoles")}</option><option value="ADMIN">{t("superAdmin")}</option>
          <option value="STAFF">{t("staff")}</option></select>
        <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")}
          title={t("usersRefresh")} onClick={invalidate}><RefreshCw size={17} aria-hidden="true" /></Button>
      </div>
    </Card>
    <div className={"users-results-heading flex items-center justify-between gap-[15px] my-[24px_17px] text-[length:12px] min-h-[24px] [&_>_span:first-child]:flex [&_>_span:first-child]:items-center [&_>_span:first-child]:gap-[9px] [&_>_span:first-child]:font-semibold [&_strong]:p-[3px_9px] [&_strong]:bg-[var(--accent)] [&_strong]:text-[color:var(--primary)] [&_strong]:rounded-[var(--radius-pill)]"}><span><Users size={17} aria-hidden="true" />{t("usersRegistered")}
      {data && <strong>{data.total}</strong>}</span>
      <span role="status" className={"muted text-[color:var(--muted-foreground)]"}>{loading && t(data ? "usersUpdating" : "working")}</span></div>
    {error && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8] auth-error bg-[var(--danger-soft)] text-[color:var(--danger)]"} role="alert">{t(error)}</p>}
    <section className={"users-card-grid grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-[var(--space-gap)] min-[1800px]:grid-cols-[repeat(4,_minmax(0,_1fr))] max-[1000px]:grid-cols-[repeat(2,_minmax(0,_1fr))]"} aria-label={t("usersRegistered")} aria-busy={loading}>
      {data?.users.map((user) => <UserProfileCard key={user.id} user={user} accountId={account.id}
        onEdit={editUser} onView={viewUser} onBlock={chooseBlock} />)}
      {!data && loading && Array.from({ length: 6 }, (_, index) => <Card key={index} className={"users-card-skeleton min-h-[330px] overflow-hidden pb-[24px] [&_span]:block [&_span]:bg-[var(--muted)] [&_span]:[animation:users-pulse_1.4s_ease-in-out_infinite] [&_span:first-child]:h-[82px] [&_span:first-child]:bg-[var(--accent)] [&_span:nth-child(2)]:h-[84px] [&_span:nth-child(2)]:w-[84px] [&_span:nth-child(2)]:rounded-[50%] [&_span:nth-child(2)]:m-[-40px_auto_30px] [&_span:nth-child(2)]:[border:5px_solid_var(--card)] [&_span:nth-child(2)]:relative [&_span:last-child]:h-[12px] [&_span:last-child]:w-[65%] [&_span:last-child]:rounded-[var(--radius-control)] [&_span:last-child]:m-auto"} aria-hidden="true">
        <span /><span /><span /></Card>)}
    </section>
    {!loading && !error && data?.users.length === 0 && <Card className={"users-empty p-[44px_20px] text-center text-[color:var(--muted-foreground)]"}>{t("usersEmpty")}</Card>}
    {data && <div className={"users-pagination flex items-center justify-between gap-[var(--space-gap)] pt-[24px]"}><span className={"muted text-[color:var(--muted-foreground)]"}>{t("usersPage")} {data.page}
      / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className={"header-actions flex items-center gap-[12px]"}>
        <Button variant="outline" size="small" disabled={loading || data.page <= 1}
          onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total}
          onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}

    <Dialog open={open} busy={formBusy} onOpenChange={(value) => { if (!value) finishEditor(); }}
      className={"users-editor-dialog w-[min(780px,_calc(100vw_-_40px))] max-h-[90vh] [&_.dialog-description]:text-[length:12px] [&_.dialog-description]:max-w-[620px]"} title={t(editing ? "usersEdit" : "usersAdd")} description={t("usersFormHelp")}>
      {open && <CreateUserForm user={editing ?? undefined} actorId={account.id} onChanged={markChanged}
        onBusyChange={setFormBusy} onSaved={() => { setNotice("usersSavedSuccess"); finishEditor(); }} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }}
      className={"users-view-dialog w-[min(540px,_calc(100vw_-_40px))]"} title={t("usersView")} description={t("accountDescription")}>
      {viewing && <div className={"users-profile-details flex flex-col items-center gap-[12px] pt-[24px] [&_.user-card-avatar]:mt-0 [&_dl]:w-full [&_dl]:my-[12px] [&_dl_>_div]:grid [&_dl_>_div]:grid-cols-[120px_1fr] [&_dl_>_div]:gap-[15px] [&_dl_>_div]:[border-top:1px_solid_var(--border)] [&_dl_>_div]:py-[13px] [&_dt]:text-[color:var(--muted-foreground)] [&_dt]:text-[length:12px] [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:whitespace-pre-wrap [&_dd]:text-[length:12px]"}>
        <span className={"user-card-avatar relative inline-flex items-center justify-center w-[88px] h-[88px] mt-[-43px] shrink-0 [border:5px_solid_var(--card)] rounded-[50%] bg-[var(--accent)] text-[color:var(--primary)] overflow-hidden [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover"}>{viewing.fullName.slice(0, 2).toUpperCase()}
          {viewing.hasPhoto && <img alt="" src={`/api/v1/users/${viewing.id}/photo?v=${encodeURIComponent(viewing.updatedAt)}`}
            onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
        <h3>{viewing.fullName}</h3><p className={"muted text-[color:var(--muted-foreground)]"}>{t(viewing.role === "ADMIN" ? "superAdmin" : "staff")}</p>
        <dl>{([["email", viewing.email], ["usersMobile", viewing.phone], ["usersAge", viewing.age],
          ["usersGender", t(viewing.gender === "MALE" ? "usersMale" : viewing.gender === "FEMALE" ? "usersFemale"
            : viewing.gender === "OTHER" ? "usersOther" : "usersUnspecified")],
          ["usersLanguage", viewing.language === "en" ? "English" : "اردو"],
          ["status", t(viewing.status === "ACTIVE" ? "usersActive" : viewing.status === "BLOCKED" ? "usersBlocked"
            : viewing.status === "INACTIVE" ? "usersInactive" : "pending")],
          ["usersAddress", viewing.address], ["usersRemarks", viewing.remarks]] as const).map(([key, value]) =>
          <div key={key}><dt>{t(key)}</dt><dd dir={key === "email" || key === "usersMobile" ? "ltr" : undefined}>{value || "—"}</dd></div>)}</dl>
        <Button variant="outline" onClick={() => editUser(viewing)}>{t("usersEdit")}</Button>
      </div>}
    </Dialog>
    <Dialog open={blockTarget !== null} busy={blocking} onOpenChange={(value) => { if (!value) setBlockTarget(null); }}
      title={t(blockTarget?.status === "BLOCKED" ? "usersUnblock" : "usersBlock")}
      description={t(blockTarget?.status === "BLOCKED" ? "usersUnblockHelp" : "usersBlockHelp")}>
      <p className={"users-target-name mt-[var(--space-gap)] font-semibold"}>{blockTarget?.fullName}</p>
      {notice && <p className={"form-message p-[12px_14px] rounded-[var(--radius-control)] bg-[var(--muted)] text-[color:var(--muted-foreground)] text-[length:12px] leading-[1.8]"} role="alert">{t(notice)}</p>}
      <div className={"dialog-actions flex gap-[10px] flex-wrap mt-[24px]"}><Button loading={blocking} onClick={() => void changeBlock()}>
        {t(blocking ? "usersSaving" : blockTarget?.status === "BLOCKED" ? "usersUnblock" : "usersBlock")}</Button>
        <Button variant="outline" disabled={blocking} onClick={() => setBlockTarget(null)}>{t("close")}</Button></div>
    </Dialog>
  </AppShell>;
}
