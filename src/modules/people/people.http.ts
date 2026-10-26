import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { NextResponse } from "next/server";
import { boundedBody, userFailure } from "@/modules/users/users.http";
import { collectorSubmissionSchema } from "@/modules/people/people.schema";
import type { NextRequest } from "next/server";

export function collectorListFailure(error: unknown) {
  if (error instanceof AuthFailure && error.code !== "AUTH_UNAVAILABLE") return userFailure(error);
  const details: Record<string, unknown> = { stage: "fundraiser-list" };
  let code = "PEOPLE_UNAVAILABLE";
  if (error instanceof z.ZodError) {
    code = "PEOPLE_DATA_INVALID";
    details.type = "ValidationError";
    details.fields = error.issues.map((issue) => ({ field: issue.path.map(String).join("."), code: issue.code,
      ...(issue.code === "unrecognized_keys" ? { keys: issue.keys } : {}) }));
  } else {
    let failure: unknown = error;
    for (let depth = 0; depth < 4 && failure instanceof Error && failure.cause; depth++) failure = failure.cause;
    if (typeof failure === "object" && failure !== null) {
      if ("code" in failure && typeof failure.code === "string") details.sqlState = failure.code;
      if ("message" in failure && typeof failure.message === "string" && details.sqlState === "42703") {
        const missing = failure.message.match(/column\s+([a-zA-Z0-9_."\\]+)\s+does not exist/i)?.[1]?.replaceAll('"', "");
        if (missing) details.missingObject = missing;
        if (missing?.includes("collection_area_id")) code = "PEOPLE_IMPORT_SETUP_REQUIRED";
      }
      if (failure instanceof Error) details.type = failure.name;
    }
    if (details.sqlState === "42P01" && typeof failure === "object" && failure !== null
      && "message" in failure && typeof failure.message === "string" && /relation\s+"(?:public\.)?fundraisers"\s+does not exist/i.test(failure.message)) {
      code = "PEOPLE_TABLE_SETUP_REQUIRED"; details.missingObject = "public.fundraisers";
    }
    details.type ??= "Error";
  }
  return NextResponse.json({ data: null, error: { code, details }, meta: {} },
    { status: 503, headers: { "Cache-Control": "no-store" } });
}

export async function collectorInput(request: NextRequest) {
  const bytes = await boundedBody(request, 2 * 1024 * 1024 + 32768);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new AuthFailure("INVALID_INPUT", 400); }
  let values: unknown;
  try { values = JSON.parse(String(form.get("data") ?? "")); }
  catch { throw new AuthFailure("INVALID_INPUT", 400); }
  const parsed = collectorSubmissionSchema.safeParse(values);
  if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
  const photo = form.get("photo");
  if (photo !== null && !(photo instanceof File)) throw new AuthFailure("INVALID_PHOTO", 400);
  return { input: parsed.data, photo };
}
export function collectorId(value: string) {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new AuthFailure("INVALID_INPUT", 400);
  return result.data;
}
