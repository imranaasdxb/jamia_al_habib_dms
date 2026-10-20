import { z } from "zod";
import { requireSameOrigin } from "@/modules/auth/auth.service";
import { AuthFailure } from "@/modules/auth/auth.types";
import { loadFlow, withUsersRequest } from "@/modules/users/users.repository";
import { userActionSchema } from "@/modules/users/users.schema";
import { blockUser, resendUserOtp, saveUserProfile, startOnboarding, verifyUserOtp } from "@/modules/users/users.service";
import { userFailure, userJson, userResponse } from "@/modules/users/users.http";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
interface Context { params: Promise<{ id: string }> }
async function personId(context: Context) {
  const parsed = z.uuid().safeParse((await context.params).id);
  if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
  return parsed.data;
}
async function getUser(_request: NextRequest, context: Context) {
  try {
    const flow = await loadFlow(await personId(context));
    return userResponse({ personId: flow.personId, flowId: flow.id, email: flow.targetEmail,
      needsVerification: flow.state !== "COMPLETE", proofComplete: flow.state === "VERIFIED" || flow.state === "COMPLETE" });
  } catch (error) { return userFailure(error); }
}
async function postUser(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const id = await personId(context);
    const parsed = userActionSchema.safeParse(await userJson(request));
    if (!parsed.success) throw new AuthFailure("INVALID_INPUT", 400);
    const input = parsed.data;
    const origin = request.nextUrl.origin;
    if (input.action === "onboard") return userResponse(await startOnboarding(input.values, origin, id));
    if (input.action === "save") return userResponse(await saveUserProfile(id, input.values, input.version, origin));
    if (input.action === "resend") return userResponse(await resendUserOtp(id, input.flowId, origin));
    if (input.action === "verify") return userResponse(await verifyUserOtp(id, input.flowId, input.otp, origin));
    return userResponse(await blockUser(id, input.blocked));
  } catch (error) { return userFailure(error); }
}

export const GET = (request: NextRequest, context: Context) => withUsersRequest(() => getUser(request, context));
export const POST = (request: NextRequest, context: Context) => withUsersRequest(() => postUser(request, context));
