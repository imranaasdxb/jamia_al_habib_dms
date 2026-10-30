import { z } from "zod";
import { donorQuerySchema } from "@/modules/donors/donors.schema";
import { readDonorHistory } from "@/modules/donors/donors.repository";
import { donorFailure } from "@/modules/donors/donors.http";
import { userResponse } from "@/modules/users/users.http";
import { AuthFailure } from "@/modules/auth/auth.types";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const query = donorQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!z.string().regex(/^[a-f0-9]{32}$/).safeParse(key).success || !query.success) throw new AuthFailure("INVALID_INPUT", 400);
    const result = await readDonorHistory(key, query.data);
    return userResponse(result.data, 200, result.meta);
  } catch (error) { return donorFailure(error); }
}
