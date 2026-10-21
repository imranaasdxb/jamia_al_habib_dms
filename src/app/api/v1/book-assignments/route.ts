import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { bookFailure } from "@/modules/books/books.http";
import { createAssignment, listAssignments } from "@/modules/books/assignments.repository";
import { assignmentQuerySchema, assignmentSubmissionSchema, indiaToday } from "@/modules/books/assignments.schema";
import { userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const parsed = assignmentQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const { rows, ...meta } = await listAssignments(parsed.data);
    return userResponse(rows, 200, meta);
  } catch (error) { return bookFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const parsed = assignmentSubmissionSchema.safeParse(await userJson(request));
    if (!parsed.success || parsed.data.values.assignmentDate > indiaToday()) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await createAssignment(parsed.data), 201);
  } catch (error) { return bookFailure(error); }
}
