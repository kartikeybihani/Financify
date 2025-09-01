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
    
    console.log("Debug: About to call store_plaid_token with:", { 
      item_id, 
      user_id, 
      token_length: access_token?.length 
    });
    
    const { data, error } = await supabase.rpc("secure_store_plaid_token", {
      p_item_id: item_id,
      p_user_id: user_id,
      p_token: access_token
    });
    
    console.log("Debug: RPC result:", { data, error });
    
    if (error) {
      console.error("Error storing Plaid token:", error);
      return new Response(JSON.stringify({ 
        error: error.message, 
        code: error.code, 
        details: error.details 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log("✅ Token stored in Vault with secret_id:", data);
    return new Response(JSON.stringify({ success: true, secret_id: data }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error parsing request:", error);
    return new Response("Invalid request body", { status: 400 });
  }
});
