import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { listUsers, withUsersRequest } from "@/modules/users/users.repository";
import { createUserSchema, usersQuerySchema } from "@/modules/users/users.schema";
import { startOnboarding } from "@/modules/users/users.service";
import { userFailure, userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
async function getUsers(request: NextRequest) {
  try {
    const parsed = usersQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const result = await listUsers(parsed.data);
    return userResponse(result.users, 200, { total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (error) { return userFailure(error); }
}
async function postUsers(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const parsed = createUserSchema.safeParse(await userJson(request));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    return userResponse(await startOnboarding(parsed.data, request.nextUrl.origin), 201);
  } catch (error) { return userFailure(error); }
}

export const GET = (request: NextRequest) => withUsersRequest(() => getUsers(request));
export const POST = (request: NextRequest) => withUsersRequest(() => postUsers(request));
