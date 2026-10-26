import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { getEditionReceiptSample } from "@/modules/masters/masters.repository";
import { masterFailure } from "@/modules/masters/masters.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) throw new AuthFailure("INVALID_INPUT", 400);
    return new Response(await getEditionReceiptSample(id.data), { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=60", Vary: "Cookie",
      "Content-Disposition": "inline; filename=edition-receipt.jpg", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    } });
  } catch (error) { return masterFailure(error); }
}
