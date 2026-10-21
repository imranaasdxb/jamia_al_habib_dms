import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { readAssignment } from "@/modules/books/assignments.repository";
import { userResponse } from "@/modules/users/users.http";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await readAssignment(id));
  } catch (error) { return bookFailure(error); }
}
