/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// SnapTrade API configuration
const SNAPTRADE_BASE_URL = "https://api.snaptrade.com/api/v1";
const SNAPTRADE_CLIENT_ID = Deno.env.get("SNAPTRADE_CLIENT_ID")!;
const SNAPTRADE_CONSUMER_KEY = Deno.env.get("SNAPTRADE_CONSUMER_KEY")!;

// Helper function to call SnapTrade API using fetch
async function callSnapTradeAPI(endpoint: string, params: Record<string, any>) {
  const url = new URL(`${SNAPTRADE_BASE_URL}${endpoint}`);
  
  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value.toString());
    }
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "clientId": SNAPTRADE_CLIENT_ID,
      "consumerKey": SNAPTRADE_CONSUMER_KEY,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`SnapTrade API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

serve(async (req: Request) => {
  try {
    console.log("🔄 Starting investments sync...");
    
    const { user_id, snaptrade_user_id, account_id } = (await req.json()) as {
      user_id: string;
      snaptrade_user_id: string;
      account_id: string;
    };
    
    console.log("📋 Sync request:", { 
      user_id: user_id.substring(0, 8) + "...", 
      snaptrade_user_id,
      account_id: account_id.substring(0, 8) + "..."
    });
    
    if (!user_id || !snaptrade_user_id || !account_id) {
      console.error("❌ Missing required parameters");
      return new Response("Missing user_id, snaptrade_user_id, or account_id", { status: 400 });
    }

    // 1. Get user_secret directly from database
    console.log("🔑 Fetching user_secret from database...");
    const { data: connection, error: tokenErr } = await supabase
      .from("snaptrade_connections")
      .select("user_secret")
      .eq("user_id", user_id)
      .eq("snaptrade_user_id", snaptrade_user_id)
      .eq("account_id", account_id)
      .eq("is_active", true)
      .single();

    if (tokenErr || !connection?.user_secret) {
      console.error("❌ Database credential fetch failed:", tokenErr);
      return new Response("Credentials not found", { status: 404 });
    }

    const user_secret = connection.user_secret;
    console.log("✅ User secret retrieved from database");

    // 2. Sync Account Balances
    console.log("💰 Syncing account balances...");
    try {
      const balanceData = await callSnapTradeAPI(`/accounts/${account_id}/balances`, {
        userId: snaptrade_user_id,
        userSecret: user_secret
      });

      if (balanceData && balanceData.length > 0) {
        const balanceRows = balanceData.map((balance: any) => ({
          user_id,
          snaptrade_user_id,
          account_id,
          currency_code: balance.currency?.code || 'USD',
          cash: balance.cash || 0,
          buying_power: balance.buying_power || 0,
          total_equity: 0, // Not provided in API response
          total_margin_used: 0, // Not provided in API response
          total_margin_available: 0, // Not provided in API response
          is_current: true,
          last_updated: new Date().toISOString()
        }));

        // Mark all previous balances as not current
        await supabase
          .from("investment_balances")
          .update({ is_current: false })
          .eq("snaptrade_user_id", snaptrade_user_id)
          .eq("account_id", account_id);

        // Insert new balances
        const { error: balanceErr } = await supabase
          .from("investment_balances")
          .upsert(balanceRows, { onConflict: "snaptrade_user_id,account_id,currency_code" });

        if (balanceErr) {
          console.error("❌ Balance upsert error:", balanceErr);
        } else {
          console.log("✅ Balances synced successfully");
        }
      }
    } catch (error) {
      console.error("❌ Error syncing balances:", error);
    }

    // 3. Sync Holdings (Regular Positions)
    console.log("📈 Syncing investment holdings...");
    try {
      const holdingsData = await callSnapTradeAPI(`/accounts/${account_id}/positions`, {
        userId: snaptrade_user_id,
        userSecret: user_secret
      });

      if (holdingsData && holdingsData.length > 0) {
        const holdingsRows = holdingsData.map((holding: any) => {
          const symbol = holding.symbol?.symbol || holding.symbol;
          return {
            user_id,
            snaptrade_user_id,
            account_id,
            symbol_id: symbol?.id,
            symbol: symbol?.symbol,
            raw_symbol: symbol?.raw_symbol,
            description: symbol?.description,
            currency_code: holding.currency?.code || 'USD',
            exchange_code: symbol?.exchange?.code,
            exchange_name: symbol?.exchange?.name,
            security_type: symbol?.type?.description,
            units: holding.units || 0,
            price: holding.price,
            market_value: holding.units && holding.price ? holding.units * holding.price : null,
            average_purchase_price: holding.average_purchase_price,
            total_cost_basis: holding.units && holding.average_purchase_price ? holding.units * holding.average_purchase_price : null,
            unrealized_pl: holding.open_pnl,
            realized_pl: 0, // Not provided in API response
            day_change: null, // Not provided in API response
            day_change_percent: null, // Not provided in API response
            is_active: true,
            last_updated: new Date().toISOString()
          };
        });

        const { error: holdingsErr } = await supabase
          .from("investment_holdings")
          .upsert(holdingsRows, { onConflict: "snaptrade_user_id,account_id,symbol_id" });

        if (holdingsErr) {
          console.error("❌ Holdings upsert error:", holdingsErr);
        } else {
          console.log("✅ Holdings synced successfully");
        }
      }
    } catch (error) {
      console.error("❌ Error syncing holdings:", error);
    }

    // 4. Sync Options Positions
    console.log("📊 Syncing options positions...");
    try {
      const optionsData = await callSnapTradeAPI(`/accounts/${account_id}/options`, {
        userId: snaptrade_user_id,
        userSecret: user_secret
      });

      if (optionsData && optionsData.length > 0) {
        const optionsRows = optionsData.map((option: any) => {
          const optionSymbol = option.symbol?.option_symbol;
          const underlying = optionSymbol?.underlying_symbol;
          const contractMultiplier = optionSymbol?.is_mini_option ? 10 : 100;
          
          return {
            user_id,
            snaptrade_user_id,
            account_id,
            option_symbol_id: optionSymbol?.id,
            ticker: optionSymbol?.ticker,
            option_type: optionSymbol?.option_type,
            strike_price: optionSymbol?.strike_price,
            expiration_date: optionSymbol?.expiration_date,
            is_mini_option: optionSymbol?.is_mini_option || false,
            underlying_symbol_id: underlying?.id,
            underlying_symbol: underlying?.symbol,
            underlying_description: underlying?.description,
            underlying_currency_code: option.currency?.code || 'USD',
            underlying_exchange_code: underlying?.exchange?.code,
            underlying_security_type: underlying?.type?.description,
            units: option.units || 0,
            price: option.price,
            market_value: option.units && option.price ? option.units * option.price * contractMultiplier : null,
            average_purchase_price: option.average_purchase_price,
            total_cost_basis: option.units && option.average_purchase_price ? option.units * option.average_purchase_price * contractMultiplier : null,
            unrealized_pl: null, // Not provided in API response
            realized_pl: 0, // Not provided in API response
            day_change: null, // Not provided in API response
            day_change_percent: null, // Not provided in API response
            is_active: true,
            last_updated: new Date().toISOString()
          };
        });

        const { error: optionsErr } = await supabase
          .from("investment_options")
          .upsert(optionsRows, { onConflict: "snaptrade_user_id,account_id,option_symbol_id" });

        if (optionsErr) {
          console.error("❌ Options upsert error:", optionsErr);
        } else {
          console.log("✅ Options synced successfully");
        }
      }
    } catch (error) {
      console.error("❌ Error syncing options:", error);
    }

    // 5. Update last_synced_at timestamp
    await supabase
      .from("snaptrade_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("snaptrade_user_id", snaptrade_user_id)
      .eq("account_id", account_id);

    console.log("✅ Investments sync completed successfully");
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Investments synced successfully" 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("❌ Investments sync error:", error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
