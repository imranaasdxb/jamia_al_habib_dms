import { AuthFailure } from "@/modules/auth/auth.types";
import { userResponse } from "@/modules/users/users.http";
import { searchQuerySchema } from "@/modules/navigation/navigation.schema";
import { searchNavigation } from "@/modules/navigation/navigation.repository";
import { navigationFailure } from "@/modules/navigation/navigation.http";
export const runtime="nodejs";
export async function GET(request:Request){
 try{const query=searchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)throw new AuthFailure("INVALID_INPUT",400);
  return userResponse(await searchNavigation(query.data.q));
 }catch(error){return navigationFailure(error);}
}
