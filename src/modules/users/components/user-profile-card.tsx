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
  return <Card className={"user-profile-card overflow-hidden flex flex-col"}>
    <div className={"user-card-cover h-[82px] p-[14px_16px] flex items-start justify-between [background:linear-gradient(125deg,_var(--primary-soft),_var(--accent))]"}>
      <Badge tone={user.status === "ACTIVE" ? "success" : blocked ? "danger" : "warning"}>
        {t(statusLabels[user.status])}
      </Badge>
      {user.id === accountId && <span className={"user-card-self text-[color:var(--primary)] text-[length:11px] p-[4px]"}>{t("usersYou")}</span>}
    </div>
    <div className={"user-card-body flex flex-1 flex-col items-center p-[0_20px_20px] [&_h3]:mt-[12px] [&_h3]:text-[length:16px] [&_h3]:font-[650] [&_h3]:text-center [&_h3]:[overflow-wrap:anywhere]"}>
      <span className={"user-card-avatar relative inline-flex items-center justify-center w-[88px] h-[88px] mt-[-43px] shrink-0 [border:5px_solid_var(--card)] rounded-[50%] bg-[var(--accent)] text-[color:var(--primary)] overflow-hidden [&_img]:absolute [&_img]:inset-0 [&_img]:w-full [&_img]:h-full [&_img]:object-cover"} aria-hidden="true">
        <UserRound size={36} />
        {user.hasPhoto && <img alt="" loading="lazy" decoding="async"
          src={`/api/v1/users/${user.id}/photo?v=${encodeURIComponent(user.updatedAt)}`}
          onError={(event) => { event.currentTarget.hidden = true; }} />}
      </span>
      <h3>{user.fullName}</h3>
      <span className={"user-card-role inline-flex items-center gap-[5px] mt-[7px] text-[color:var(--primary)] text-[length:11px]"}><ShieldCheck size={14} aria-hidden="true" />
        {t(user.role === "ADMIN" ? "superAdmin" : "staff")}</span>
      <div className={"user-card-contact w-full py-[19px] mt-[16px] [border-block:1px_solid_var(--border)] [&_p]:flex [&_p]:items-center [&_p]:gap-[9px] [&_p]:text-[length:12px] [&_p]:text-[color:var(--muted-foreground)] [&_p_+_p]:mt-[12px] [&_svg]:shrink-0 [&_p_span]:min-w-0 [&_p_span]:overflow-hidden [&_p_span]:text-ellipsis [&_p_span]:whitespace-nowrap"}>
        <p><Mail size={15} aria-hidden="true" /><span dir="ltr">{user.email ?? "—"}</span></p>
        <p><Phone size={15} aria-hidden="true" /><span dir="ltr">{user.phone ?? "—"}</span></p>
      </div>
      {user.verificationPending && <span className={"user-card-pending text-[length:10px] text-[color:var(--warning)] self-start pt-[10px]"}>{t("usersPendingVerification")}</span>}
      <div className={"user-card-actions flex items-center w-full gap-[6px] pt-[17px] mt-auto [&_.button-small]:flex-1 [&_.button-small]:min-w-0 [&_.button-small]:gap-[5px] [&_.button-small]:px-[7px] [&_.button-icon]:w-[34px] [&_.button-icon]:h-[34px] [&_.button-icon]:p-[6px] [&_.button-icon]:shrink-0"}>
        <Button variant="outline" size="small" onClick={() => onView(user)}>
          <Eye size={15} aria-hidden="true" />{t("usersView")}</Button>
        <Button variant="outline" size="small" onClick={() => onEdit(user)}>
          <PencilLine size={15} aria-hidden="true" />
          {t(user.verificationPending || !user.accountCreated ? "usersFinishSetup" : "usersEdit")}</Button>
        <Button variant="ghost" size="icon" className={blocked ? undefined : "user-block-action text-[color:var(--danger)]"}
          aria-label={t(blocked ? "usersUnblock" : "usersBlock")}
          title={t(blocked ? "usersUnblock" : "usersBlock")}
          disabled={user.id === accountId || (blocked && (!user.accountCreated || user.verificationPending))}
          onClick={() => onBlock(user)}><Ban size={17} aria-hidden="true" /></Button>
      </div>
    </div>
  </Card>;
});
