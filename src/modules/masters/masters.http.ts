import { AuthFailure } from "@/modules/auth/auth.types";
import { boundedBody, userFailure, userJson } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export async function masterSubmissionBody(request: NextRequest): Promise<{ payload: unknown; photo?: File }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return { payload: await userJson(request) };
  }
  try {
    const bytes = await boundedBody(request, 2 * 1024 * 1024 + 32768);
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const payload = form.get("payload"); const photo = form.get("receiptSample");
    if (typeof payload !== "string" || new TextEncoder().encode(payload).length > 16384
      || !(photo instanceof File) || form.getAll("payload").length !== 1 || form.getAll("receiptSample").length !== 1
      || [...form.keys()].some((key) => key !== "payload" && key !== "receiptSample")) throw new AuthFailure("INVALID_INPUT", 400);
    if (photo.size === 0 || photo.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
      throw new AuthFailure("INVALID_PHOTO", 400);
    }
    return { payload: JSON.parse(payload), photo };
  } catch (error) { if (error instanceof AuthFailure) throw error; throw new AuthFailure("INVALID_INPUT", 400); }
}

export function masterFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const databaseError = [error, cause].find((item) => typeof item === "object" && item !== null && "code" in item) as { code?: string } | undefined;
  const editionErrors: Record<string, string> = { P2001: "EDITION_STOCK_LOCKED", P2002: "EDITION_STOCK_CONFLICT", P2003: "EDITION_TOKEN_REQUIRED", P2004: "EDITION_RANGE_CONTINUITY" };
  const editionCode = databaseError?.code ? editionErrors[databaseError.code] : undefined;
  if (editionCode) return userFailure(new AuthFailure(editionCode, 409));
  if ([error, cause].some((item) => typeof item === "object" && item !== null && "code" in item && item.code === "42703"
    && "message" in item && typeof item.message === "string" && item.message.includes("edition_receipt_photo_key"))) {
    return userFailure(new AuthFailure("MASTER_RECEIPT_SAMPLE_SETUP_REQUIRED", 503));
  }
  if ([error, cause].some((item) => typeof item === "object" && item !== null && "code" in item && item.code === "23505")) {
    return userFailure(new AuthFailure("MASTER_EXISTS", 409));
  }
  if ([error, cause].some((item) => typeof item === "object" && item !== null && "code" in item && item.code === "42703"
    && "message" in item && typeof item.message === "string"
    && /edition_|printing_year|pages_from|pages_to|pages_per_book|book_quantity|designed_printed_by/.test(item.message))) {
    return userFailure(new AuthFailure("MASTER_EDITION_SETUP_REQUIRED", 503));
  }
  return userFailure(error);
}
