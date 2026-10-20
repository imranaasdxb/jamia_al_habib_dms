import { NextResponse } from "next/server";
import { AuthFailure } from "@/modules/auth/auth.types";
import type { NextRequest } from "next/server";

const headers = { "Cache-Control": "no-store" };
export function userResponse(data: unknown, status = 200, meta: Record<string, unknown> = {}) {
  return NextResponse.json({ data, error: null, meta }, { status, headers });
}
export function userFailure(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  const duplicate = [error, cause].some((value) => typeof value === "object"
    && value !== null && "code" in value && value.code === "23505");
  const status = error instanceof AuthFailure ? error.status : duplicate ? 409 : 503;
  const code = error instanceof AuthFailure ? error.code : duplicate ? "USER_EXISTS" : "AUTH_UNAVAILABLE";
  const changed = error instanceof AuthFailure && "dataChanged" in error && error.dataChanged === true;
  return NextResponse.json({ data: null, error: { code }, meta: { changed } }, { status, headers });
}
export async function boundedBody(request: NextRequest, maximum: number) {
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new AuthFailure("INVALID_INPUT", 413);
  if (!request.body) throw new AuthFailure("INVALID_INPUT", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new AuthFailure("INVALID_INPUT", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function userJson(request: NextRequest): Promise<unknown> {
  try { return JSON.parse(new TextDecoder().decode(await boundedBody(request, 16384))); }
  catch (error) { if (error instanceof AuthFailure) throw error; throw new AuthFailure("INVALID_INPUT", 400); }
}
