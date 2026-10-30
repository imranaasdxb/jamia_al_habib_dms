import { z } from "zod";
import { AuthFailure } from "@/modules/auth/auth.types";
import { userResponse } from "@/modules/users/users.http";
import { readDonation } from "@/modules/donations/donations.repository";
import { donationFailure } from "@/modules/donations/donations.http";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;if(!z.uuid().safeParse(id).success)throw new AuthFailure("INVALID_INPUT",400);
    return userResponse(await readDonation(id));
  }catch(error){return donationFailure(error);}
}
