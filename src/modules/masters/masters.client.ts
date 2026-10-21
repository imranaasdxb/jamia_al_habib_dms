"use client";
import { usersRequest } from "@/modules/users/users.client";
import type { MasterKind, MasterValues } from "@/modules/masters/masters.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export const masterCategories: { kind: MasterKind; label: MessageKey }[] = [
  { kind: "EDITION", label: "mastersEditions" }, { kind: "BOOK_TYPE", label: "mastersBookTypes" },
  { kind: "TOKEN_VALUE", label: "mastersTokenValues" }, { kind: "DONATION_HEAD", label: "mastersHeads" },
  { kind: "RESPONSIBILITY", label: "mastersResponsibilities" }, { kind: "AREA", label: "mastersAreas" },
  { kind: "PAYMENT_MODE", label: "mastersPaymentModes" }, { kind: "UPI_APP", label: "mastersUpiApps" },
  { kind: "BANK", label: "mastersBanks" }, { kind: "BANK_ACCOUNT", label: "mastersBankAccounts" },
  { kind: "RECEIPT_REASON", label: "mastersReceiptReasons" }, { kind: "FLAG_REASON", label: "mastersFlagReasons" },
];
export const masterLevelLabels: Record<Exclude<MasterValues["level"], "">, MessageKey> = {
  STATE: "peopleState", DISTRICT: "peopleDistrict", BLOCK: "mastersBlock", VILLAGE: "mastersVillage",
};
export function masterDefaults(kind: MasterKind): MasterValues {
  return { code: "", nameEn: "", nameUr: "", active: true, notes: "", needsDetail: false,
    effectiveFrom: kind === "EDITION" ? new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10) : "",
    level: kind === "AREA" ? "STATE" : "", parentId: "", tokenValue: "", accountName: "", lastFour: "", upiId: "" };
}
export const mastersRequest = usersRequest;
export function mastersError(error: unknown): MessageKey {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, MessageKey> = { MASTER_EXISTS: "mastersDuplicate", ACCESS_DENIED: "authDenied",
    SESSION_EXPIRED: "authExpired", INVALID_INPUT: "mastersInvalid", MASTER_FIXED: "mastersFixed",
    MASTER_PARENT: "mastersInvalidParent", MASTER_HAS_CHILDREN: "mastersHasChildren",
    STALE_MASTER: "mastersStale", MASTER_NOT_FOUND: "mastersNotFound" };
  return messages[code] ?? "mastersFailed";
}
