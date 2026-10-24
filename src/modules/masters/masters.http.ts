import { AuthFailure } from "@/modules/auth/auth.types";
import { userFailure } from "@/modules/users/users.http";

export function masterFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const databaseError = [error, cause].find((item) => typeof item === "object" && item !== null && "code" in item) as { code?: string } | undefined;
  const editionErrors: Record<string, string> = { P2001: "EDITION_STOCK_LOCKED", P2002: "EDITION_STOCK_CONFLICT", P2003: "EDITION_TOKEN_REQUIRED", P2004: "EDITION_RANGE_CONTINUITY" };
  const editionCode = databaseError?.code ? editionErrors[databaseError.code] : undefined;
  if (editionCode) return userFailure(new AuthFailure(editionCode, 409));
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
