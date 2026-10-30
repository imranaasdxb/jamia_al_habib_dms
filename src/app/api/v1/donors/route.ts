import { donorQuerySchema } from "@/modules/donors/donors.schema";
import { readDonorDirectory } from "@/modules/donors/donors.repository";
import { donorFailure } from "@/modules/donors/donors.http";
import { userResponse } from "@/modules/users/users.http";
import { AuthFailure } from "@/modules/auth/auth.types";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const query = donorQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AuthFailure("INVALID_INPUT", 400);
    const result = await readDonorDirectory(query.data);
    return userResponse(result.data, 200, result.meta);
  } catch (error) { return donorFailure(error); }
}
