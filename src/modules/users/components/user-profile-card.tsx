"use client";

import { memo } from "react";
import { Ban, Eye, Mail, PencilLine, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserRow } from "@/modules/users/users.types";
import type { MessageKey } from "@/lib/i18n/messages";

const statusLabels: Record<UserRow["status"], MessageKey> = {
  ACTIVE: "usersActive", PENDING: "pending", INACTIVE: "usersInactive", BLOCKED: "usersBlocked",
};
export const UserProfileCard = memo(function UserProfileCard({ user, accountId, onEdit, onView, onBlock }: {
  user: UserRow; accountId: string; onEdit: (user: UserRow) => void;
  onView: (user: UserRow) => void; onBlock: (user: UserRow) => void;
}) {
  const { t } = useLanguage();
  const blocked = user.status === "BLOCKED";
  return <Card className="user-profile-card">
    <div className="user-card-cover">
      <Badge tone={user.status === "ACTIVE" ? "success" : blocked ? "danger" : "warning"}>
        {t(statusLabels[user.status])}
      </Badge>
      {user.id === accountId && <span className="user-card-self">{t("usersYou")}</span>}
    </div>
    <div className="user-card-body">
      <span className="user-card-avatar" aria-hidden="true">
        <UserRound size={36} />
        {user.hasPhoto && <img alt="" loading="lazy" decoding="async"
          src={`/api/v1/users/${user.id}/photo?v=${encodeURIComponent(user.updatedAt)}`}
          onError={(event) => { event.currentTarget.hidden = true; }} />}
      </span>
      <h3>{user.fullName}</h3>
      <span className="user-card-role"><ShieldCheck size={14} aria-hidden="true" />
        {t(user.role === "ADMIN" ? "superAdmin" : "staff")}</span>
      <div className="user-card-contact">
        <p><Mail size={15} aria-hidden="true" /><span dir="ltr">{user.email ?? "—"}</span></p>
        <p><Phone size={15} aria-hidden="true" /><span dir="ltr">{user.phone ?? "—"}</span></p>
      </div>
      {user.verificationPending && <span className="user-card-pending">{t("usersPendingVerification")}</span>}
      <div className="user-card-actions">
        <Button variant="outline" size="small" onClick={() => onView(user)}>
          <Eye size={15} aria-hidden="true" />{t("usersView")}</Button>
        <Button variant="outline" size="small" onClick={() => onEdit(user)}>
          <PencilLine size={15} aria-hidden="true" />
          {t(user.verificationPending || !user.accountCreated ? "usersFinishSetup" : "usersEdit")}</Button>
        <Button variant="ghost" size="icon" className={blocked ? undefined : "user-block-action"}
          aria-label={t(blocked ? "usersUnblock" : "usersBlock")}
          title={t(blocked ? "usersUnblock" : "usersBlock")}
          disabled={user.id === accountId || (blocked && (!user.accountCreated || user.verificationPending))}
          onClick={() => onBlock(user)}><Ban size={17} aria-hidden="true" /></Button>
      </div>
    </div>
  </Card>;
});
