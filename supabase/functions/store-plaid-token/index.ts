// functions/store-plaid-token/index.ts
/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface RequestBody {
  item_id: string;
  user_id: string;
  access_token: string;
}

serve(async (req: Request) => {
  try {
    const { item_id, user_id, access_token }: RequestBody = await req.json();
    
    const { error } = await supabase.rpc("secure.store_plaid_token", {
      p_item_id: item_id,
      p_user_id: user_id as any, // Ensure UUID type casting
      p_token: access_token
    });
    
    if (error) {
      console.error("Error storing Plaid token:", error);
      return new Response(error.message, { status: 500 });
    }
    
    return new Response("OK");
  } catch (error) {
    console.error("Error parsing request:", error);
    return new Response("Invalid request body", { status: 400 });
  }
});
