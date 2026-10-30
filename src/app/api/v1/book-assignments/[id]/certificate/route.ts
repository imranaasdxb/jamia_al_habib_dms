import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { readAuthorizationCertificate } from "@/modules/books/certificates.repository";
import { userResponse } from "@/modules/users/users.http";
import { certificateScopeSchema } from "@/modules/books/certificates.schema";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const scope = certificateScopeSchema.safeParse(new URL(request.url).searchParams.get("scope") ?? "ASSIGNMENT");
    if (!z.uuid().safeParse(id).success || !scope.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await readAuthorizationCertificate(id, scope.data));
  } catch (error) {
    if (error instanceof AuthFailure) return bookFailure(error);
    const cause = error instanceof Error ? error.cause : undefined;
    const missingSetup = [error, cause].some((item) => typeof item === "object" && item !== null && "code" in item
      && (item.code === "42P01" || item.code === "42703" || item.code === "42501"));
    return bookFailure(new AuthFailure(missingSetup ? "CERTIFICATE_SETUP_REQUIRED" : "CERTIFICATE_UNAVAILABLE", 503));
  }
}
