import { AuthFailure } from "@/modules/auth/auth.types";
import { userFailure } from "@/modules/users/users.http";

export function masterFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  if ([error, cause].some((item) => typeof item === "object" && item !== null && "code" in item && item.code === "23505")) {
    return userFailure(new AuthFailure("MASTER_EXISTS", 409));
  }
  return userFailure(error);
}
