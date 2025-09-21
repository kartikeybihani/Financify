// /api/store_accounts.js
import { client } from "../app/plaidClient.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { item_id, mode, user_id } = req.body;

  // Handle SnapTrade investment account population
  if (mode === "populate_investment_accounts") {
    return handleInvestmentAccountPopulation(req, res, user_id);
  }

  // Handle financial summary generation
  if (mode === "financial_summary") {
    return handleFinancialSummary(req, res, user_id);
  }

  // Handle regular Plaid account storage
  if (!item_id) {
    return res.status(400).json({ error: "Missing item_id" });
  }

  try {
    console.log(
      "🏦 Fetching and storing ALL financial data for item_id:",
      item_id
    );

    // 1. Get user_id for this item
    const { data: userItem, error: fetchErr } = await supabase
      .from("user_items")
      .select("user_id")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !userItem) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 2. Get access_token from Vault
    const { data: access_token, error: tokenError } = await supabase.rpc(
      "secure_get_plaid_token",
      { p_item_id: item_id, p_user_id: userItem.user_id }
    );

    if (tokenError || !access_token) {
      console.error("Error retrieving Plaid token from Vault:", tokenError);
      return res.status(404).json({ error: "Access token not found" });
    }
    let storedData = {};

    // 2. Fetch and store ACCOUNTS
    try {
      console.log("📊 Fetching accounts...");
      const accountsResponse = await client.accountsGet({ access_token });
      const accounts = accountsResponse.data.accounts;

      if (accounts.length > 0) {
        const accountsToStore = accounts.map((account) => ({
          account_id: account.account_id,
          item_id: item_id,
          name: account.name,
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          official_name: account.official_name,
          current_balance: account.balances.current,
          available_balance: account.balances.available,
        }));

        const { error: accountsError } = await supabase
          .from("accounts")
          .upsert(accountsToStore, {
            onConflict: "account_id",
            ignoreDuplicates: false,
          });

        if (accountsError) throw accountsError;
        console.log(`✅ Stored ${accounts.length} accounts`);
        storedData.accounts = accounts.length;
      }
    } catch (error) {
      console.error("⚠️ Accounts fetch failed:", error.message);
      storedData.accounts = 0;
    }

    // 3. Fetch and store INSTITUTION data
    try {
      console.log("🏢 Fetching institution...");
      const itemResponse = await client.itemGet({ access_token });
      const institutionId = itemResponse.data.item.institution_id;
      const institutionResponse = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: ["US"],
      });

      const institution = institutionResponse.data.institution;

      // Update the user_items table with institution info
      await supabase
        .from("user_items")
        .update({
          institution_id: institution.institution_id,
          institution_name: institution.name,
        })
        .eq("item_id", item_id);

      console.log(`✅ Updated institution: ${institution.name}`);
      storedData.institution = institution.name;
    } catch (error) {
      console.error("⚠️ Institution fetch failed:", error.message);
      storedData.institution = "Unknown";
    }

    // 4. Fetch INVESTMENTS (optional - may not exist for all accounts)
    try {
      console.log("📈 Fetching investments...");
      const holdingsResponse = await client.investmentsHoldingsGet({
        access_token,
      });
      const transactionsResponse = await client.investmentsTransactionsGet({
        access_token,
        start_date: "2020-01-01",
        end_date: new Date().toISOString().split("T")[0],
      });

      storedData.investments = {
        holdings: holdingsResponse.data.holdings.length,
        securities: holdingsResponse.data.securities.length,
        transactions: transactionsResponse.data.investment_transactions.length,
      };
      console.log(
        `✅ Found ${holdingsResponse.data.holdings.length} investment holdings`
      );
    } catch (error) {
      console.log("ℹ️ No investments found (this is normal for most accounts)");
      storedData.investments = { holdings: 0, securities: 0, transactions: 0 };
    }

    // 5. Fetch LIABILITIES (optional - credit cards, loans)
    try {
      console.log("💳 Fetching liabilities...");
      const liabilitiesResponse = await client.liabilitiesGet({ access_token });
      const liabilityCount = liabilitiesResponse.data.liabilities?.length || 0;
      storedData.liabilities = liabilityCount;
      console.log(`✅ Found ${liabilityCount} liabilities`);
    } catch (error) {
      console.log(
        "ℹ️ No liabilities found (this is normal for depository accounts)"
      );
      storedData.liabilities = 0;
    }

    // 6. Fetch IDENTITY (optional - account holder info)
    try {
      console.log("🆔 Fetching identity...");
      const identityResponse = await client.identityGet({ access_token });
      storedData.identity = identityResponse.data.accounts.length;
      console.log(
        `✅ Found identity for ${identityResponse.data.accounts.length} accounts`
      );
    } catch (error) {
      console.log("ℹ️ Identity not available (this is normal)");
      storedData.identity = 0;
    }

    console.log("🎉 Financial data storage complete:", storedData);

    return res.status(200).json({
      message: "Financial data stored successfully",
      stored: storedData,
      item_id: item_id,
    });
  } catch (error) {
    console.error("❌ store_accounts error:", error);
    const plaidError = error.response?.data;

    return res.status(500).json({
      error: plaidError?.error_message || error.message,
      details: plaidError || error,
    });
  }
}

// === SnapTrade Investment Account Population Handler ===
async function handleInvestmentAccountPopulation(req, res, user_id) {
  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    console.log("🔄 Populating investment accounts for user:", user_id);

    // Get all SnapTrade connections for this user
    const { data: connections, error: connError } = await supabase
      .from("snaptrade_connections")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (connError) throw connError;

    if (!connections || connections.length === 0) {
      return res.status(200).json({
        success: true,
        populated: 0,
        message: "No SnapTrade connections found",
      });
    }

    // Get current holdings and balances
    const { data: holdings, error: holdingsError } = await supabase
      .from("investment_holdings")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (holdingsError) throw holdingsError;

    const { data: balances, error: balancesError } = await supabase
      .from("investment_balances")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_current", true);

    if (balancesError) throw balancesError;

    let populatedCount = 0;

    for (const connection of connections) {
      try {
        // Calculate total portfolio value from holdings
        const accountHoldings = holdings.filter(
          (h) => h.account_id === connection.account_id
        );
        const totalHoldingsValue = accountHoldings.reduce(
          (sum, holding) => sum + (holding.market_value || 0),
          0
        );

        // Get cash balance
        const cashBalance = balances.find(
          (b) => b.account_id === connection.account_id
        );
        const cashAmount = cashBalance?.cash || 0;

        // Total investment value = holdings + cash
        const totalValue = totalHoldingsValue + cashAmount;

        // Create a unique item_id for SnapTrade accounts
        const investmentItemId = `snaptrade-${connection.account_id}`;

        // First, check if this investment account already exists
        const { data: existingAccount, error: checkError } = await supabase
          .from("accounts")
          .select("account_id")
          .eq("account_id", connection.account_id)
          .single();

        if (existingAccount) {
          console.log(
            `ℹ️ Investment account ${connection.account_id} already exists, updating balance...`
          );

          // Update the existing account with new balance
          const { error: updateError } = await supabase
            .from("accounts")
            .update({
              current_balance: totalValue,
              available_balance: cashAmount,
            })
            .eq("account_id", connection.account_id);

          if (updateError) {
            console.error(
              `❌ Failed to update investment account ${connection.account_id}:`,
              updateError
            );
          } else {
            console.log(
              `✅ Updated investment account ${
                connection.account_id
              } with balance: $${totalValue.toFixed(2)}`
            );
            populatedCount++;
          }
        } else {
          // Ensure a matching user_items row exists for the synthetic SnapTrade item_id
          const brokerageSlug = (
            connection.brokerage_name || "Investment Broker"
          )
            .toLowerCase()
            .replace(/\s+/g, "-");

          const { error: upsertItemError } = await supabase
            .from("user_items")
            .upsert(
              {
                user_id: user_id,
                item_id: investmentItemId,
                institution_name:
                  connection.brokerage_name || "Investment Broker",
                institution_id: `snaptrade-${brokerageSlug}`,
                has_new_accounts: false,
                requires_update_mode: false,
                last_synced_at:
                  connection.last_synced_at || new Date().toISOString(),
              },
              { onConflict: "item_id" }
            );

          if (upsertItemError) {
            console.error(
              `❌ Failed to ensure user_items entry for investment account:`,
              upsertItemError
            );
            continue; // Skip creating the account if user_items upsert fails
          } else {
            console.log(
              `✅ Ensured user_items entry exists for investment account item_id ${investmentItemId}`
            );
          }

          // Now create the investment account entry
          const investmentAccount = {
            account_id: connection.account_id,
            item_id: investmentItemId,
            name: connection.account_name || "Investment Account",
            mask: null,
            type: "investment",
            subtype: "investment",
            official_name: `${
              connection.brokerage_name || "Investment"
            } Account`,
            current_balance: totalValue,
            available_balance: cashAmount,
          };

          const { error: insertError } = await supabase
            .from("accounts")
            .insert(investmentAccount);

          if (insertError) {
            console.error(
              `❌ Failed to insert investment account ${connection.account_id}:`,
              insertError
            );
          } else {
            console.log(
              `✅ Created investment account ${
                connection.account_id
              } with balance: $${totalValue.toFixed(2)}`
            );
            populatedCount++;
          }
        }
      } catch (accountError) {
        console.error(
          `❌ Error processing investment account ${connection.account_id}:`,
          accountError
        );
      }
    }

    console.log(
      `✅ Investment accounts population completed: ${populatedCount} accounts processed`
    );
    return res.status(200).json({
      success: true,
      populated: populatedCount,
      message: `Successfully populated ${populatedCount} investment accounts`,
    });
  } catch (error) {
    console.error("❌ Failed to populate investment accounts:", error);
    return res.status(500).json({
      error: "Failed to populate investment accounts",
      details: error.message,
    });
  }
}

// === Financial Summary Handler ===
async function handleFinancialSummary(req, res, user_id) {
  if (!user_id) {
    return res.status(400).json({ error: "user_id required" });
  }

  try {
    console.log("📊 Generating financial summary for user:", user_id);

    // Get net worth from RPC
    const { data: netWorthData, error: nwErr } = await supabase.rpc(
      "get_net_worth",
      { p_user_id: user_id }
    );

    if (nwErr) {
      console.error("Error fetching net worth:", nwErr);
      return res.status(500).json({ error: nwErr.message });
    }

    // Get investments snapshot from RPC
    const { data: invSnap, error: invErr } = await supabase.rpc(
      "get_investment_snapshot",
      { p_user_id: user_id }
    );

    if (invErr) {
      console.error("Error fetching investments snapshot:", invErr);
      return res.status(500).json({ error: invErr.message });
    }

    // Get recent transactions (last 10)
    const { data: recentTxns, error: txnErr } = await supabase.rpc(
      "get_recent_transactions",
      { p_user_id: user_id, p_limit: 10 }
    );

    if (txnErr) {
      console.error("Error fetching recent transactions:", txnErr);
    }

    // Get spend by category for current month
    const currentDate = new Date();
    const firstDayOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const lastDayOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );

    const { data: spendByCategory, error: catErr } = await supabase.rpc(
      "get_spend_by_category",
      {
        p_user_id: user_id,
        p_start: firstDayOfMonth.toISOString().split("T")[0],
        p_end: lastDayOfMonth.toISOString().split("T")[0],
      }
    );

    if (catErr) {
      console.error("Error fetching spend by category:", catErr);
    }

    // Get cashflow for last 3 months
    const { data: cashflow, error: cfErr } = await supabase.rpc(
      "get_cashflow_monthly",
      { p_user_id: user_id, p_months: 3 }
    );

    if (cfErr) {
      console.error("Error fetching cashflow:", cfErr);
    }

    // Get active recurring streams
    const { data: recurringStreams, error: rsErr } = await supabase.rpc(
      "get_recurring_streams_active",
      { p_user_id: user_id }
    );

    if (rsErr) {
      console.error("Error fetching recurring streams:", rsErr);
    }

    // Get upcoming bills (recurring next dates)
    const { data: upcomingBills, error: billsErr } = await supabase.rpc(
      "get_recurring_next_dates",
      { p_user_id: user_id }
    );

    if (billsErr) {
      console.error("Error fetching upcoming bills:", billsErr);
    }

    // Get goals overview
    const { data: goalsOverview, error: goalsErr } = await supabase.rpc(
      "get_goals_overview",
      { p_user_id: user_id, p_limit: 5 }
    );

    if (goalsErr) {
      console.error("Error fetching goals overview:", goalsErr);
    }

    // Get detailed investment holdings
    const { data: investmentHoldings, error: holdingsErr } = await supabase.rpc(
      "get_investment_holdings_detailed",
      { p_user_id: user_id }
    );

    if (holdingsErr) {
      console.error("Error fetching investment holdings:", holdingsErr);
    }

    // Debug logging
    console.log("Net worth data:", netWorthData);
    console.log("Investment snapshot data:", invSnap);
    console.log("Recent transactions:", recentTxns?.length || 0);
    console.log("Spend by category:", spendByCategory?.length || 0);
    console.log("Cashflow months:", cashflow?.length || 0);
    console.log("Active recurring streams:", recurringStreams?.length || 0);
    console.log("Upcoming bills:", upcomingBills?.length || 0);
    console.log("Goals:", goalsOverview?.length || 0);
    console.log("Investment holdings:", investmentHoldings?.length || 0);

    // Return complete RPC data for Finny to use
    const netWorthRecord = netWorthData?.[0];
    const investmentRecord = invSnap?.[0];

    const summary = {
      summary: {
        netWorth: Math.round(Number(netWorthRecord?.net_worth ?? 0)),
        liquidAssets: Math.round(Number(netWorthRecord?.liquid_assets ?? 0)),
        investmentsTotal: Math.round(
          Number(netWorthRecord?.investments_total ?? 0)
        ),
        totalLiabilities: Math.round(
          Number(netWorthRecord?.total_liabilities ?? 0)
        ),
        investmentCash: Math.round(
          Number(investmentRecord?.investment_cash ?? 0)
        ),
      },
      bankAccounts: netWorthRecord?.bank_accounts || [],
      transactions: {
        recent: recentTxns || [],
        spendByCategory: spendByCategory || [],
        cashflow: cashflow || [],
      },
      recurring: {
        active: recurringStreams || [],
        upcoming: upcomingBills || [],
      },
      goals: goalsOverview || [],
      holdings: investmentHoldings || [],
      meta: {
        investmentsAsOf: investmentRecord?.as_of ?? null,
        rawNetWorthData: netWorthRecord,
        rawInvestmentData: investmentRecord,
      },
    };

    console.log("✅ Financial summary generated successfully");
    return res.status(200).json(summary);
  } catch (error) {
    console.error("❌ Failed to generate financial summary:", error);
    return res.status(500).json({
      error: "Failed to generate financial summary",
      details: error.message,
    });
  }
}
