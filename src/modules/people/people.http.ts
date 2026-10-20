import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { boundedBody } from "@/modules/users/users.http";
import { collectorSubmissionSchema } from "@/modules/people/people.schema";
import type { NextRequest } from "next/server";

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
