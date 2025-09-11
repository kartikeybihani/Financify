// functions/store-snaptrade-credentials/index.ts
/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface RequestBody {
  user_id: string;
  snaptrade_user_id: string;
  account_id: string;
  user_secret: string;
  connection_id?: string;
  brokerage_name?: string;
  account_name?: string;
  account_type?: string;
}

serve(async (req: Request) => {
  try {
    const { 
      user_id, 
      snaptrade_user_id, 
      account_id, 
      user_secret,
      connection_id,
      brokerage_name,
      account_name,
      account_type
    }: RequestBody = await req.json();
    
    console.log("Debug: About to call secure_store_snaptrade_credentials with:", { 
      user_id: user_id.substring(0, 8) + "...",
      snaptrade_user_id,
      account_id: account_id.substring(0, 8) + "...",
      secret_length: user_secret?.length 
    });
    
    // Store the user_secret securely in Vault
    const { data: secretId, error: vaultError } = await supabase.rpc("secure_store_snaptrade_credentials", {
      p_user_id: user_id,
      p_snaptrade_user_id: snaptrade_user_id,
      p_account_id: account_id,
      p_user_secret: user_secret
    });
    
    console.log("Debug: Vault RPC result:", { secretId, vaultError });
    
    if (vaultError) {
      console.error("Error storing SnapTrade credentials in Vault:", vaultError);
      return new Response(JSON.stringify({ 
        error: vaultError.message, 
        code: vaultError.code, 
        details: vaultError.details 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Store connection metadata in snaptrade_connections table
    const { data: connectionData, error: connectionError } = await supabase
      .from("snaptrade_connections")
      .upsert({
        user_id,
        snaptrade_user_id,
        account_id,
        connection_id,
        brokerage_name,
        account_name,
        account_type,
        user_secret_id: secretId,
        is_active: true,
        last_synced_at: new Date().toISOString()
      }, { 
        onConflict: "snaptrade_user_id,account_id" 
      })
      .select()
      .single();
    
    if (connectionError) {
      console.error("Error storing connection metadata:", connectionError);
      return new Response(JSON.stringify({ 
        error: connectionError.message, 
        code: connectionError.code, 
        details: connectionError.details 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log("✅ SnapTrade credentials stored securely with secret_id:", secretId);
    return new Response(JSON.stringify({ 
      success: true, 
      secret_id: secretId,
      connection_id: connectionData.id
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error parsing request:", error);
    return new Response("Invalid request body", { status: 400 });
  }
});
