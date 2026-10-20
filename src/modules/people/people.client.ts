"use client";
import { usersRequest } from "@/modules/users/users.client";
import type { CollectorValues } from "@/modules/people/people.schema";
import type { MessageKey } from "@/lib/i18n/messages";

export const collectorLabels: Record<keyof CollectorValues, MessageKey> = {
  fullName: "fullName", phone: "usersMobile", email: "email", age: "usersAge", gender: "usersGender",
  language: "usersLanguage", status: "status", fatherName: "peopleFather", whatsapp: "peopleWhatsapp",
  idProofName: "peopleIdProof", commission: "peopleCommission", village: "peopleVillage",
  postOffice: "peoplePostOffice", block: "peopleBlock", district: "peopleDistrict", state: "peopleState",
  pin: "peoplePin", remarks: "usersRemarks",
};
export const collectorDefaults: CollectorValues = {
  fullName: "", phone: "", email: "", age: "", gender: "MALE", language: "en", status: "ACTIVE",
  fatherName: "", whatsapp: "", idProofName: "", commission: "", village: "", postOffice: "", block: "",
  district: "Jagatsinghpur", state: "Odisha", pin: "", remarks: "",
};
export const peopleRequest = usersRequest;
export function peopleError(error: unknown): MessageKey {
  const code = error instanceof Error ? error.message : "";
  const messages: Record<string, MessageKey> = {
    USER_EXISTS: "peopleDuplicate", INVALID_INPUT: "peopleInvalid", ACCESS_DENIED: "authDenied",
    SESSION_EXPIRED: "authExpired", STALE_COLLECTOR: "peopleStale", COLLECTOR_NOT_FOUND: "peopleNotFound",
    COLLECTOR_REQUEST_PENDING: "peoplePendingRequest", COLLECTOR_REQUEST_CLOSED: "peopleClosedRequest",
    STORAGE_NOT_CONFIGURED: "usersStorageSetup", STORAGE_UNAVAILABLE: "usersStorageFailed", INVALID_PHOTO: "usersInvalidPhoto",
  };
  return messages[code] ?? "peopleFailed";
}
