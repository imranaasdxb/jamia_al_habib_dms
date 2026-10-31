import { userResponse } from "@/modules/users/users.http";
import { readNotifications } from "@/modules/navigation/navigation.repository";
import { navigationFailure } from "@/modules/navigation/navigation.http";
export const runtime="nodejs";
export async function GET(){try{return userResponse(await readNotifications());}catch(error){return navigationFailure(error);}}
