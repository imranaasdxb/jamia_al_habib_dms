import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { getEditionCollectionTotals } from "@/modules/books/edition-totals.repository";
import { userResponse } from "@/modules/users/users.http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return userResponse(await getEditionCollectionTotals());
  } catch (error) {
    if (error instanceof AuthFailure) return bookFailure(error);
    const cause = error instanceof Error ? error.cause : undefined;
    const root = cause instanceof Error ? cause : error;
    const details: { type: string; sqlState?: string; object?: string; message?: string; fields?: string[] } = {
      type: root instanceof Error ? root.name : "UnknownError",
    };
    for (const value of [cause, error]) {
      if (typeof value !== "object" || value === null || !("code" in value)
        || typeof value.code !== "string" || !/^[A-Z0-9]{5}$/.test(value.code)) continue;
      details.sqlState = value.code;
      const message = "message" in value && typeof value.message === "string" ? value.message : "";
      const object = /^(?:column|relation) "?([a-z_][a-z0-9_.*]*)/i.exec(message)?.[1];
      if (object) details.object = object;
      break;
    }
    if (error instanceof ZodError) details.fields = error.issues.map((issue) => issue.path.map(String).join("."));
    if (root instanceof TypeError || root instanceof ReferenceError) {
      details.message = root.message.replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"<>]+/gi, "[redacted-url]").slice(0, 300);
    }
    console.error("[edition-totals] Unable to load collection totals", {
      type: details.type, sqlState: details.sqlState, object: details.object, fields: details.fields,
    });
    return NextResponse.json({ data: null, error: { code: "EDITION_SUMMARY_UNAVAILABLE", details }, meta: {} },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
