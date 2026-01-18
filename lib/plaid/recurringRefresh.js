// /lib/plaid/recurringRefresh.js
// Shared recurring transactions refresh logic (Plaid -> DB)

function getCategoryFromStreamType(streamType) {
  const mapping = {
    subscription: "Subscriptions",
    income: "Income",
    bill: "Housing",
    other: "Other",
  };
  return mapping[streamType] || null;
}

async function backfillRecurringCategories(supabase, userId, recurringRows) {
  const transactionToStreamMap = new Map();

  recurringRows.forEach((stream) => {
    if (stream.transaction_ids && Array.isArray(stream.transaction_ids)) {
      stream.transaction_ids.forEach((txId) => {
        transactionToStreamMap.set(txId, {
          streamId: stream.stream_id,
          streamType: stream.stream_type,
        });
      });
    }
  });

  const transactionIds = Array.from(transactionToStreamMap.keys());
  if (transactionIds.length === 0) return { updated: 0 };

  const { data: transactions, error: fetchErr } = await supabase
    .from("transactions")
    .select("id, plaid_transaction_id, recurring_stream_id, new_category, if_recurring")
    .eq("user_id", userId)
    .in("plaid_transaction_id", transactionIds);

  if (fetchErr) {
    throw new Error(`Failed to fetch transactions: ${fetchErr.message}`);
  }

  if (!transactions || transactions.length === 0) return { updated: 0 };

  const updates = [];
  transactions.forEach((tx) => {
    const streamData = transactionToStreamMap.get(tx.plaid_transaction_id);
    if (!streamData) return;

    const update = { id: tx.id, user_id: userId };
    let hasChanges = false;

    if (!tx.recurring_stream_id) {
      update.recurring_stream_id = streamData.streamId;
      hasChanges = true;
    }

    if (tx.if_recurring !== "yes") {
      update.if_recurring = "yes";
      hasChanges = true;
    }

    if (!tx.new_category) {
      const categoryToSet = getCategoryFromStreamType(streamData.streamType);
      if (categoryToSet && streamData.streamType !== "other") {
        update.new_category = categoryToSet;
        hasChanges = true;
      }
    }

    if (hasChanges) updates.push(update);
  });

  if (updates.length === 0) return { updated: 0 };

  const { error: updateErr } = await supabase
    .from("transactions")
    .upsert(updates, { onConflict: "id", ignoreDuplicates: false });

  if (updateErr) {
    throw new Error(`Failed to update transactions: ${updateErr.message}`);
  }

  return { updated: updates.length };
}

export async function refreshAndStoreRecurringForItem({
  supabase,
  plaidClient,
  accessToken,
  itemId,
  userId,
}) {
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("account_id")
    .eq("item_id", itemId);

  if (accountsError) {
    throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
  }

  if (!accounts || accounts.length === 0) {
    return {
      stored: 0,
      summary: { subscriptions: 0, income: 0, bills: 0, other: 0, total: 0 },
      updated_transactions: 0,
      reason: "no_accounts",
    };
  }

  const accountIds = accounts.map((acc) => acc.account_id);
  const recurringResponse = await plaidClient.transactionsRecurringGet({
    access_token: accessToken,
    account_ids: accountIds,
  });

  const recurringData = recurringResponse.data;
  const processedStreams = {
    subscriptions: [],
    income: [],
    bills: [],
    other: [],
  };

  if (recurringData.outflow_streams) {
    recurringData.outflow_streams.forEach((stream) => {
      const streamData = {
        stream_id: stream.stream_id,
        description: stream.description,
        merchant_name: stream.merchant_name,
        category: stream.category?.[0] || "Other",
        frequency: stream.frequency,
        average_amount: stream.average_amount?.amount || 0,
        last_amount: stream.last_amount?.amount || 0,
        last_date: stream.last_date,
        first_date: stream.first_date,
        is_active: stream.is_active,
        account_id: stream.account_id,
        transaction_ids: stream.transaction_ids || [],
        iso_currency_code: stream.average_amount?.iso_currency_code || "USD",
      };

      const category = stream.category?.[0]?.toLowerCase() || "";
      const merchant = (stream.merchant_name || "").toLowerCase();

      if (
        category.includes("subscription") ||
        merchant.includes("netflix") ||
        merchant.includes("spotify") ||
        merchant.includes("apple") ||
        merchant.includes("google") ||
        merchant.includes("amazon prime") ||
        merchant.includes("hulu") ||
        merchant.includes("disney") ||
        merchant.includes("youtube") ||
        merchant.includes("adobe") ||
        merchant.includes("microsoft")
      ) {
        processedStreams.subscriptions.push(streamData);
      } else if (
        category.includes("utilities") ||
        category.includes("rent") ||
        merchant.includes("electric") ||
        merchant.includes("gas") ||
        merchant.includes("water") ||
        merchant.includes("rent") ||
        merchant.includes("mortgage") ||
        merchant.includes("insurance") ||
        merchant.includes("phone") ||
        merchant.includes("internet")
      ) {
        processedStreams.bills.push(streamData);
      } else {
        processedStreams.other.push(streamData);
      }
    });
  }

  if (recurringData.inflow_streams) {
    recurringData.inflow_streams.forEach((stream) => {
      processedStreams.income.push({
        stream_id: stream.stream_id,
        description: stream.description,
        merchant_name: stream.merchant_name,
        category: stream.category?.[0] || "Income",
        frequency: stream.frequency,
        average_amount: stream.average_amount?.amount || 0,
        last_amount: stream.last_amount?.amount || 0,
        last_date: stream.last_date,
        first_date: stream.first_date,
        is_active: stream.is_active,
        account_id: stream.account_id,
        transaction_ids: stream.transaction_ids || [],
        iso_currency_code: stream.average_amount?.iso_currency_code || "USD",
      });
    });
  }

  // Mark existing streams inactive for this item
  await supabase
    .from("recurring_streams")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("item_id", itemId);

  const now = new Date().toISOString();
  const recurringRows = [
    ...processedStreams.subscriptions.map((s) => ({
      user_id: userId,
      item_id: itemId,
      account_id: s.account_id,
      stream_id: s.stream_id,
      stream_type: "subscription",
      flow_type: "outflow",
      description: s.description,
      merchant_name: s.merchant_name,
      category: s.category,
      average_amount: s.average_amount,
      last_amount: s.last_amount,
      iso_currency_code: s.iso_currency_code,
      frequency: s.frequency,
      first_date: s.first_date,
      last_date: s.last_date,
      is_active: s.is_active,
      transaction_ids: s.transaction_ids,
      last_synced_at: now,
    })),
    ...processedStreams.income.map((s) => ({
      user_id: userId,
      item_id: itemId,
      account_id: s.account_id,
      stream_id: s.stream_id,
      stream_type: "income",
      flow_type: "inflow",
      description: s.description,
      merchant_name: s.merchant_name,
      category: s.category,
      average_amount: s.average_amount,
      last_amount: s.last_amount,
      iso_currency_code: s.iso_currency_code,
      frequency: s.frequency,
      first_date: s.first_date,
      last_date: s.last_date,
      is_active: s.is_active,
      transaction_ids: s.transaction_ids,
      last_synced_at: now,
    })),
    ...processedStreams.bills.map((s) => ({
      user_id: userId,
      item_id: itemId,
      account_id: s.account_id,
      stream_id: s.stream_id,
      stream_type: "bill",
      flow_type: "outflow",
      description: s.description,
      merchant_name: s.merchant_name,
      category: s.category,
      average_amount: s.average_amount,
      last_amount: s.last_amount,
      iso_currency_code: s.iso_currency_code,
      frequency: s.frequency,
      first_date: s.first_date,
      last_date: s.last_date,
      is_active: s.is_active,
      transaction_ids: s.transaction_ids,
      last_synced_at: now,
    })),
    ...processedStreams.other.map((s) => ({
      user_id: userId,
      item_id: itemId,
      account_id: s.account_id,
      stream_id: s.stream_id,
      stream_type: "other",
      flow_type: "outflow",
      description: s.description,
      merchant_name: s.merchant_name,
      category: s.category,
      average_amount: s.average_amount,
      last_amount: s.last_amount,
      iso_currency_code: s.iso_currency_code,
      frequency: s.frequency,
      first_date: s.first_date,
      last_date: s.last_date,
      is_active: s.is_active,
      transaction_ids: s.transaction_ids,
      last_synced_at: now,
    })),
  ];

  let storedCount = 0;
  if (recurringRows.length > 0) {
    const { data: insertedData, error: upsertErr } = await supabase
      .from("recurring_streams")
      .upsert(recurringRows, { onConflict: "stream_id", ignoreDuplicates: false })
      .select();

    if (upsertErr) {
      throw new Error(`Failed to store recurring streams: ${upsertErr.message}`);
    }

    storedCount = insertedData?.length || recurringRows.length;
  }

  const backfillResult =
    recurringRows.length > 0
      ? await backfillRecurringCategories(supabase, userId, recurringRows)
      : { updated: 0 };

  return {
    stored: storedCount,
    updated_transactions: backfillResult.updated,
    summary: {
      subscriptions: processedStreams.subscriptions.length,
      income: processedStreams.income.length,
      bills: processedStreams.bills.length,
      other: processedStreams.other.length,
      total:
        processedStreams.subscriptions.length +
        processedStreams.income.length +
        processedStreams.bills.length +
        processedStreams.other.length,
    },
  };
}

