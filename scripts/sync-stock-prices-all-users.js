#!/usr/bin/env node

/**
 * Manual sync: Update stock prices (Finnhub prevClose-based day_change) for all users with holdings.
 * Updates investment_holdings and investment_balances.
 *
 * Usage: node scripts/sync-stock-prices-all-users.js
 *
 * Requires: .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FINNHUB_API_KEY
 */

import "dotenv/config";
import { supabase } from "../lib/api/supabase.js";
import { fetchQuoteOnly } from "../lib/stocks.js";

const BATCH_DELAY = 1100; // Finnhub rate limit
const cashEquivalentSymbols = ["SPAXX", "SPRXX", "FZFXX", "FDRXX", "SNAXX"];

const isCashEquivalent = (h) => {
  const symbol = h.symbol?.toUpperCase();
  const st = (h.security_type || "").toLowerCase();
  const desc = (h.description || "").toLowerCase();
  if (cashEquivalentSymbols.includes(symbol)) return true;
  if (
    st.includes("money market") ||
    st.includes("cash") ||
    desc.includes("money market") ||
    desc.includes("cash equivalent")
  )
    return true;
  return false;
};

async function refreshStockPricesForUser(userId) {
  const { data: holdings, error: holdingsError } = await supabase
    .from("investment_holdings")
    .select(
      "id, user_id, snaptrade_user_id, account_id, symbol, symbol_id, units, price, market_value, previous_market_value, day_change, day_change_percent, last_updated, security_type, description"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .not("symbol", "is", null)
    .neq("symbol", "");

  if (holdingsError || !holdings?.length) {
    return { updated: 0, symbolsFetched: 0 };
  }

  const allUniqueSymbols = [
    ...new Set(holdings.map((h) => h.symbol).filter(Boolean)),
  ];
  const symbolsToFetch = allUniqueSymbols.filter((sym) => {
    const h = holdings.find((x) => x.symbol === sym);
    return !h || !isCashEquivalent(h);
  });

  if (symbolsToFetch.length === 0) {
    return { updated: 0, symbolsFetched: 0 };
  }

  const priceMap = new Map();
  for (let i = 0; i < symbolsToFetch.length; i++) {
    const symbol = symbolsToFetch[i];
    try {
      const quote = await fetchQuoteOnly(symbol);
      if (quote?.current != null) {
        priceMap.set(symbol, {
          current: quote.current,
          prevClose: quote.prevClose ?? null,
        });
      }
      if (i < symbolsToFetch.length - 1) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
    } catch (err) {
      console.warn(`  ⚠️ ${symbol}: ${err.message}`);
    }
  }

  const now = new Date();
  const isSameCalendarDayUTC = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return (
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) ===
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  };

  let updatedCount = 0;
  const updatesByAccount = new Map();

  for (const holding of holdings) {
    const priceData = priceMap.get(holding.symbol);
    if (priceData == null) continue;
    const actualPrice =
      typeof priceData === "object" ? priceData.current : priceData;
    const prevClose =
      typeof priceData === "object" ? priceData.prevClose : null;
    if (actualPrice == null) continue;

    const currentMarketValue =
      holding.units && actualPrice ? holding.units * actualPrice : null;
    if (currentMarketValue == null) continue;

    let dayChange = holding.day_change;
    let dayChangePercent = holding.day_change_percent;
    let previousMarketValueForStorage = holding.previous_market_value;

    if (prevClose != null && Number.isFinite(prevClose) && prevClose > 0) {
      const prevCloseMarketValue = holding.units * prevClose;
      dayChange = currentMarketValue - prevCloseMarketValue;
      dayChangePercent = (dayChange / prevCloseMarketValue) * 100;
      previousMarketValueForStorage = prevCloseMarketValue;
    } else {
      const dayBaseline =
        holding.previous_market_value ?? holding.market_value ?? null;
      if (dayBaseline != null && Number.isFinite(dayBaseline)) {
        dayChange = currentMarketValue - dayBaseline;
        dayChangePercent =
          dayBaseline !== 0 ? (dayChange / dayBaseline) * 100 : 0;
      }
      if (!isSameCalendarDayUTC(holding.last_updated)) {
        previousMarketValueForStorage =
          holding.market_value ?? currentMarketValue;
      }
    }

    const { error: updateError } = await supabase
      .from("investment_holdings")
      .update({
        price: actualPrice,
        market_value: currentMarketValue,
        day_change: dayChange,
        day_change_percent: dayChangePercent,
        previous_market_value: previousMarketValueForStorage,
        last_updated: now.toISOString(),
      })
      .eq("id", holding.id);

    if (!updateError) {
      updatedCount++;
      const key = `${holding.user_id}:${holding.snaptrade_user_id}:${holding.account_id}`;
      if (!updatesByAccount.has(key)) {
        updatesByAccount.set(key, {
          user_id: holding.user_id,
          snaptrade_user_id: holding.snaptrade_user_id,
          account_id: holding.account_id,
        });
      }
    }
  }

  // Recalculate investment_balances for affected accounts
  const cashEq = (h) => {
    const sym = (h.symbol || "").toUpperCase();
    const st = (h.security_type || "").toLowerCase();
    const desc = (h.description || "").toLowerCase();
    if (cashEquivalentSymbols.includes(sym)) return true;
    if (
      st.includes("money market") ||
      st.includes("cash") ||
      desc.includes("money market") ||
      desc.includes("cash equivalent")
    )
      return true;
    return false;
  };

  const snapIdFilter = (q, val) =>
    val == null ? q.is("snaptrade_user_id", null) : q.eq("snaptrade_user_id", val);

  for (const acc of updatesByAccount.values()) {
    let hQuery = supabase
      .from("investment_holdings")
      .select(
        "market_value, unrealized_pl, day_change, symbol, security_type, description"
      )
      .eq("user_id", acc.user_id)
      .eq("account_id", acc.account_id)
      .eq("is_active", true);
    hQuery = snapIdFilter(hQuery, acc.snaptrade_user_id);
    const { data: hList } = await hQuery;

    let optQuery = supabase
      .from("investment_options")
      .select("market_value, unrealized_pl, day_change")
      .eq("user_id", acc.user_id)
      .eq("account_id", acc.account_id)
      .eq("is_active", true);
    optQuery = snapIdFilter(optQuery, acc.snaptrade_user_id);
    const { data: options } = await optQuery;

    let totalHoldingsValue = 0;
    let cashEquivalentInHoldings = 0;
    let totalDayChangeFromHoldings = 0;
    hList?.forEach((h) => {
      totalHoldingsValue += h.market_value || 0;
      if (cashEq(h)) cashEquivalentInHoldings += h.market_value || 0;
      totalDayChangeFromHoldings += h.day_change || 0;
    });
    options?.forEach((o) => {
      totalHoldingsValue += o.market_value || 0;
      totalDayChangeFromHoldings += o.day_change || 0;
    });

    let totalUnrealizedPL = 0;
    hList?.forEach((h) => {
      totalUnrealizedPL += h.unrealized_pl || 0;
    });
    options?.forEach((o) => {
      totalUnrealizedPL += o.unrealized_pl || 0;
    });

    let balQuery = supabase
      .from("investment_balances")
      .select(
        "total_value, cash, previous_total_value, day_change, day_change_percent, last_updated"
      )
      .eq("user_id", acc.user_id)
      .eq("account_id", acc.account_id)
      .eq("is_current", true);
    balQuery = snapIdFilter(balQuery, acc.snaptrade_user_id);
    const { data: balance, error: balErr } = await balQuery.maybeSingle();

    if (balErr || !balance) continue;

    const cash = parseFloat(balance?.cash || 0) || 0;
    const cashToAdd = Math.max(0, cash - cashEquivalentInHoldings);
    const newTotalValue = totalHoldingsValue + cashToAdd;

    const sameDay = balance.last_updated
      ? isSameCalendarDayUTC(balance.last_updated)
      : false;
    let previousTotalValue;
    if (sameDay) {
      previousTotalValue =
        balance.previous_total_value ??
        balance.total_value ??
        newTotalValue;
    } else {
      previousTotalValue = balance.total_value ?? newTotalValue;
    }

    const dayChange = totalDayChangeFromHoldings;
    const dayChangePercent =
      newTotalValue > 0 ? (dayChange / newTotalValue) * 100 : 0;
    const totalChangePercent =
      newTotalValue > 0 ? (totalUnrealizedPL / newTotalValue) * 100 : 0;

    let updateQuery = supabase
      .from("investment_balances")
      .update({
        total_value: newTotalValue,
        day_change: dayChange,
        day_change_percent: dayChangePercent,
        previous_total_value: previousTotalValue,
        total_change: totalUnrealizedPL,
        total_change_percent: totalChangePercent,
        last_updated: now.toISOString(),
      })
      .eq("user_id", acc.user_id)
      .eq("account_id", acc.account_id)
      .eq("is_current", true);
    updateQuery = snapIdFilter(updateQuery, acc.snaptrade_user_id);
    await updateQuery;
  }

  return {
    updated: updatedCount,
    symbolsFetched: priceMap.size,
    accountsRecalculated: updatesByAccount.size,
  };
}

async function main() {
  const targetUserId = process.argv[2]?.trim() || null;

  console.log("🔄 Fetching users with active holdings...\n");

  let query = supabase
    .from("investment_holdings")
    .select("user_id")
    .eq("is_active", true)
    .not("symbol", "is", null)
    .neq("symbol", "");
  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }
  const { data: userIds, error } = await query;

  if (error) {
    console.error("❌ Failed to fetch users:", error.message);
    process.exit(1);
  }

  const uniqueUserIds = [...new Set((userIds || []).map((r) => r.user_id))];

  if (uniqueUserIds.length === 0) {
    console.log("ℹ️  No users with active holdings found.");
    return;
  }

  console.log(`📊 Found ${uniqueUserIds.length} user(s) to sync\n`);

  let totalUpdated = 0;
  let totalSymbols = 0;

  for (let i = 0; i < uniqueUserIds.length; i++) {
    const uid = uniqueUserIds[i];
    const shortId = uid.substring(0, 8) + "...";
    console.log(
      `[${i + 1}/${uniqueUserIds.length}] Syncing user ${shortId}...`
    );

    try {
      const result = await refreshStockPricesForUser(uid);
      totalUpdated += result.updated;
      totalSymbols += result.symbolsFetched;
      console.log(
        `   ✅ Updated ${result.updated} holdings, ${result.accountsRecalculated} balance(s)\n`
      );
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}\n`);
    }
  }

  console.log("=".repeat(50));
  console.log(
    `✅ Done. Total: ${totalUpdated} holdings updated, ${totalSymbols} Finnhub fetches`
  );
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
