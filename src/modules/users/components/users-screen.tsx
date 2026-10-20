"use client";

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
    const response = await fetch(`/api/v1/users?${key}`, { cache: "no-store" });
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
    <div className="page-header">
      <div><h1 className="page-title">{t("users")}</h1><p className="page-subtitle">{t("usersDescription")}</p></div>
      <Button onClick={() => { setEditing(null); setOpen(true); }}>
        <Plus size={18} aria-hidden="true" />{t("usersAdd")}</Button>
    </div>
    {notice && <p className="form-message users-notice" role="status">{t(notice)}</p>}
    <Card className="users-filter-bar">
      <span className="users-filter-label"><SlidersHorizontal size={18} aria-hidden="true" />{t("usersFilters")}</span>
      <div className="users-filter-controls">
        <label className="users-filter-search"><Search size={17} aria-hidden="true" />
          <Input type="search" maxLength={100} aria-label={t("usersSearch")} placeholder={t("usersSearch")}
            value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <select className="input users-filter-role" aria-label={t("usersRole")} value={role}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "ALL" || value === "ADMIN" || value === "STAFF") { setRole(value); setPage(1); }
          }}><option value="ALL">{t("usersAllRoles")}</option><option value="ADMIN">{t("superAdmin")}</option>
          <option value="STAFF">{t("staff")}</option></select>
        <Button variant="outline" size="icon" loading={loading} aria-label={t("usersRefresh")}
          title={t("usersRefresh")} onClick={invalidate}><RefreshCw size={17} aria-hidden="true" /></Button>
      </div>
    </Card>
    <div className="users-results-heading"><span><Users size={17} aria-hidden="true" />{t("usersRegistered")}
      {data && <strong>{data.total}</strong>}</span>
      <span role="status" className="muted">{loading && t(data ? "usersUpdating" : "working")}</span></div>
    {error && <p className="form-message auth-error" role="alert">{t(error)}</p>}
    <section className="users-card-grid" aria-label={t("usersRegistered")} aria-busy={loading}>
      {data?.users.map((user) => <UserProfileCard key={user.id} user={user} accountId={account.id}
        onEdit={editUser} onView={viewUser} onBlock={chooseBlock} />)}
      {!data && loading && Array.from({ length: 6 }, (_, index) => <Card key={index} className="users-card-skeleton" aria-hidden="true">
        <span /><span /><span /></Card>)}
    </section>
    {!loading && !error && data?.users.length === 0 && <Card className="users-empty">{t("usersEmpty")}</Card>}
    {data && <div className="users-pagination"><span className="muted">{t("usersPage")} {data.page}
      / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div className="header-actions">
        <Button variant="outline" size="small" disabled={loading || data.page <= 1}
          onClick={() => setPage(data.page - 1)}>{t("usersPrevious")}</Button>
        <Button variant="outline" size="small" disabled={loading || data.page * data.pageSize >= data.total}
          onClick={() => setPage(data.page + 1)}>{t("usersNext")}</Button></div></div>}

    <Dialog open={open} busy={formBusy} onOpenChange={(value) => { if (!value) finishEditor(); }}
      className="users-editor-dialog" title={t(editing ? "usersEdit" : "usersAdd")} description={t("usersFormHelp")}>
      {open && <CreateUserForm user={editing ?? undefined} actorId={account.id} onChanged={markChanged}
        onBusyChange={setFormBusy} onSaved={() => { setNotice("usersSavedSuccess"); finishEditor(); }} />}
    </Dialog>
    <Dialog open={viewing !== null} onOpenChange={(value) => { if (!value) setViewing(null); }}
      className="users-view-dialog" title={t("usersView")} description={t("accountDescription")}>
      {viewing && <div className="users-profile-details">
        <span className="user-card-avatar">{viewing.fullName.slice(0, 2).toUpperCase()}
          {viewing.hasPhoto && <img alt="" src={`/api/v1/users/${viewing.id}/photo?v=${encodeURIComponent(viewing.updatedAt)}`}
            onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
        <h3>{viewing.fullName}</h3><p className="muted">{t(viewing.role === "ADMIN" ? "superAdmin" : "staff")}</p>
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
      <p className="users-target-name">{blockTarget?.fullName}</p>
      {notice && <p className="form-message" role="alert">{t(notice)}</p>}
      <div className="dialog-actions"><Button loading={blocking} onClick={() => void changeBlock()}>
        {t(blocking ? "usersSaving" : blockTarget?.status === "BLOCKED" ? "usersUnblock" : "usersBlock")}</Button>
        <Button variant="outline" disabled={blocking} onClick={() => setBlockTarget(null)}>{t("close")}</Button></div>
    </Dialog>
  </AppShell>;
}
