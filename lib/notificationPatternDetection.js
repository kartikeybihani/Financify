// lib/notificationPatternDetection.js
// Pattern detection for proactive notifications
import { supabase } from "./api/supabase.js";

/**
 * Detect patterns after transaction sync and create notification triggers
 * @param {string} userId - User ID
 * @param {Array} newTransactions - Array of newly added transactions
 * @returns {Promise<Array>} Array of created trigger IDs
 */
export async function detectNotificationPatterns(userId, newTransactions = []) {
  if (!userId) {
    console.warn("[PATTERN_DETECTION] No userId provided");
    return [];
  }

  const createdTriggers = [];

  try {
    // 1. Detect money received (any positive transaction - paycheck, refund, transfer, etc.)
    const moneyReceivedTriggers = await detectMoneyReceived(userId, newTransactions);
    createdTriggers.push(...moneyReceivedTriggers);

    // 2. Detect spending spikes (last 3 days vs average)
    const spikeTriggers = await detectSpendingSpikes(userId);
    createdTriggers.push(...spikeTriggers);

    // 3. Detect spending droughts (no spending for 4 days)
    const droughtTriggers = await detectSpendingDroughts(userId);
    createdTriggers.push(...droughtTriggers);

    // 4. LLM-based pattern detection (analyze last month for creative insights)
    const llmTriggers = await detectLLMPatterns(userId);
    createdTriggers.push(...llmTriggers);

    console.log(
      `✅ [PATTERN_DETECTION] Created ${createdTriggers.length} triggers for user ${userId}`
    );
    return createdTriggers;
  } catch (error) {
    console.error("[PATTERN_DETECTION] Error detecting patterns:", error);
    return createdTriggers; // Return what we have so far
  }
}

/**
 * Detect money received - ANY positive transaction (paycheck, refund, transfer, bonus, etc.)
 * More creative and comprehensive than just recurring streams
 */
async function detectMoneyReceived(userId, newTransactions) {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Get all positive transactions from last 24 hours
    const { data: recentInflows, error } = await supabase
      .from("transactions")
      .select("id, amount, date, name, merchant_name, category, top_category")
      .eq("user_id", userId)
      .gt("amount", 0) // Positive amounts only
      .gte("date", yesterday.toISOString().split("T")[0])
      .order("amount", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[PATTERN_DETECTION] Error fetching recent inflows:", error);
      return [];
    }

    if (!recentInflows || recentInflows.length === 0) {
      return [];
    }

    const triggers = [];

    // Check if we already notified about money received today
    const { data: existingTriggers } = await supabase
      .from("notification_triggers")
      .select("id")
      .eq("user_id", userId)
      .eq("trigger_type", "paycheck")
      .eq("status", "sent")
      .gte("sent_at", yesterday.toISOString())
      .limit(1);

    if (existingTriggers && existingTriggers.length > 0) {
      return []; // Already notified today
    }

    // Process each significant inflow
    for (const tx of recentInflows) {
      const amount = parseFloat(tx.amount || 0);
      
      // Threshold: $50+ or matches known income stream
      if (amount < 50) {
        continue;
      }

      // Check if this matches a recurring income stream (paycheck)
      const { data: incomeStreams } = await supabase
        .from("recurring_streams")
        .select("stream_id, average_amount, last_amount, frequency, description, merchant_name")
        .eq("user_id", userId)
        .eq("stream_type", "income")
        .eq("flow_type", "inflow")
        .eq("is_active", true);

      let isPaycheck = false;
      let matchedStream = null;

      if (incomeStreams && incomeStreams.length > 0) {
        for (const stream of incomeStreams) {
          const expectedAmount = stream.last_amount || stream.average_amount;
          // Within 15% of expected amount = likely paycheck
          if (amount >= expectedAmount * 0.85 && amount <= expectedAmount * 1.15) {
            isPaycheck = true;
            matchedStream = stream;
            break;
          }
        }
      }

      // Determine trigger type and metadata
      const triggerType = isPaycheck ? "paycheck" : "money_received";
      const metadata = {
        amount: amount,
        transaction_id: tx.id,
        name: tx.name,
        merchant_name: tx.merchant_name,
        category: tx.category || tx.top_category,
        is_paycheck: isPaycheck,
      };

      if (matchedStream) {
        metadata.stream_id = matchedStream.stream_id;
        metadata.expected_amount = matchedStream.last_amount || matchedStream.average_amount;
        metadata.frequency = matchedStream.frequency;
        metadata.description = matchedStream.description || matchedStream.merchant_name;
      }

      // Higher priority for paychecks, lower for other money received
      const priority = isPaycheck ? 9 : 7;

      const trigger = await createTrigger(userId, {
        trigger_type: triggerType,
        trigger_metadata: metadata,
        priority,
      });

      if (trigger) {
        triggers.push(trigger);
        // Only create one trigger per day (take the largest)
        break;
      }
    }

    return triggers;
  } catch (error) {
    console.error("[PATTERN_DETECTION] Error detecting money received:", error);
    return [];
  }
}

/**
 * Detect spending spikes (high spending in short period)
 */
async function detectSpendingSpikes(userId) {
  try {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get spending in last 3 days
    const { data: recentSpending, error: recentError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .gte("date", threeDaysAgo.toISOString().split("T")[0])
      .lt("amount", 0) // Outflows only
      .neq("transaction_type", "transfer");

    if (recentError) {
      console.error("[PATTERN_DETECTION] Error fetching recent spending:", recentError);
      return [];
    }

    const recentTotal = Math.abs(
      recentSpending?.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0) || 0
    );

    if (recentTotal === 0) {
      return []; // No spending, not a spike
    }

    // Get average daily spending from last 30 days
    const { data: historicalSpending, error: histError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
      .lt("amount", 0)
      .neq("transaction_type", "transfer");

    if (histError) {
      console.error("[PATTERN_DETECTION] Error fetching historical spending:", histError);
      return [];
    }

    const historicalTotal = Math.abs(
      historicalSpending?.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0) || 0
    );
    const avgDailySpending = historicalTotal / 30;
    const expectedThreeDaySpending = avgDailySpending * 3;

    // Spike detection: 2x average or $500+ in 3 days
    const isSpike = recentTotal >= expectedThreeDaySpending * 2 || recentTotal >= 500;

    if (!isSpike) {
      return [];
    }

    // Check cooldown (don't spam about spending spikes)
    const { data: recentSpikeTriggers } = await supabase
      .from("notification_triggers")
      .select("id")
      .eq("user_id", userId)
      .eq("trigger_type", "spending_spike")
      .gte("detected_at", threeDaysAgo.toISOString())
      .limit(1);

    if (recentSpikeTriggers && recentSpikeTriggers.length > 0) {
      return []; // Already detected recently
    }

    const trigger = await createTrigger(userId, {
      trigger_type: "spending_spike",
      trigger_metadata: {
        recent_total: recentTotal,
        expected_total: expectedThreeDaySpending,
        days: 3,
        spike_ratio: recentTotal / expectedThreeDaySpending,
      },
      priority: 7,
      cooldown_until: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 day cooldown
    });

    return trigger ? [trigger] : [];
  } catch (error) {
    console.error("[PATTERN_DETECTION] Error detecting spending spikes:", error);
    return [];
  }
}

/**
 * Detect spending droughts (no spending for 4 days)
 */
async function detectSpendingDroughts(userId) {
  try {
    const today = new Date();
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    // Check if user has any spending in last 4 days
    const { data: recentSpending, error } = await supabase
      .from("transactions")
      .select("id, date")
      .eq("user_id", userId)
      .lt("amount", 0) // Outflows only
      .neq("transaction_type", "transfer")
      .gte("date", fourDaysAgo.toISOString().split("T")[0])
      .limit(1);

    if (error) {
      console.error("[PATTERN_DETECTION] Error checking spending drought:", error);
      return [];
    }

    // If no spending in 4 days, create trigger
    if (!recentSpending || recentSpending.length === 0) {
      // Check if we already notified about this drought
      const { data: recentDroughtTriggers } = await supabase
        .from("notification_triggers")
        .select("id")
        .eq("user_id", userId)
        .eq("trigger_type", "spending_drought")
        .gte("detected_at", fourDaysAgo.toISOString())
        .limit(1);

      if (recentDroughtTriggers && recentDroughtTriggers.length > 0) {
        return []; // Already notified
      }

      const trigger = await createTrigger(userId, {
        trigger_type: "spending_drought",
        trigger_metadata: {
          days_without_spending: 4,
        },
        priority: 6,
        cooldown_until: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 day cooldown
      });

      return trigger ? [trigger] : [];
    }

    return [];
  } catch (error) {
    console.error("[PATTERN_DETECTION] Error detecting spending droughts:", error);
    return [];
  }
}

/**
 * LLM-based pattern detection - analyze last month's transactions for creative insights
 * This catches patterns that rule-based detection might miss
 */
async function detectLLMPatterns(userId) {
  try {
    // Check cooldown - only run LLM detection once per day
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: recentLLMTriggers } = await supabase
      .from("notification_triggers")
      .select("id")
      .eq("user_id", userId)
      .eq("trigger_type", "custom")
      .gte("detected_at", yesterday.toISOString())
      .limit(1);

    if (recentLLMTriggers && recentLLMTriggers.length > 0) {
      return []; // Already ran LLM detection today
    }

    // Get last month's transactions
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("amount, date, name, merchant_name, category, top_category, transaction_type")
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
      .neq("transaction_type", "transfer")
      .order("date", { ascending: false })
      .limit(200); // Last 200 transactions

    if (error || !transactions || transactions.length === 0) {
      return [];
    }

    // Format transactions for LLM
    const txSummary = transactions.slice(0, 50).map((tx) => ({
      date: tx.date,
      amount: parseFloat(tx.amount || 0),
      name: tx.name || tx.merchant_name || "Unknown",
      category: tx.category || tx.top_category || "Uncategorized",
    }));

    // Call LLM to detect patterns
    if (!process.env.OPENROUTER_GROK_KEY) {
      console.warn("[PATTERN_DETECTION] No OPENROUTER_GROK_KEY, skipping LLM detection");
      return [];
    }

    const llmPrompt = `Analyze these recent transactions and identify ONE interesting pattern that would make a great personalized notification. 

Transactions (last 30 days):
${JSON.stringify(txSummary, null, 2)}

Look for patterns like:
- Unusual spending spikes (weekend splurges, category changes)
- Breaking habits (first time at new merchant, category shift)
- Milestones (spending thresholds, saving opportunities)
- Behavioral changes (spending frequency, amounts)
- Contextual opportunities (goal progress, budget warnings)

Return ONLY a JSON object with:
{
  "should_notify": boolean,
  "pattern_type": "spending_spike" | "habit_change" | "milestone" | "opportunity" | null,
  "pattern_description": "brief description",
  "notification_hook": "creative hook for notification (1 sentence)",
  "priority": 1-10
}

If no interesting pattern found, set should_notify: false.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are a financial pattern detection AI. Analyze transaction data and identify ONE interesting, notification-worthy pattern. Be creative but accurate. Return ONLY valid JSON.",
          },
          { role: "user", content: llmPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("[PATTERN_DETECTION] LLM API error:", response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return [];
    }

    let patternResult;
    try {
      // Clean JSON if wrapped in markdown
      const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      patternResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("[PATTERN_DETECTION] Failed to parse LLM response:", parseError);
      return [];
    }

    if (!patternResult.should_notify || !patternResult.pattern_type) {
      return [];
    }

    // Create trigger from LLM-detected pattern
    const trigger = await createTrigger(userId, {
      trigger_type: "custom",
      trigger_metadata: {
        pattern_type: patternResult.pattern_type,
        pattern_description: patternResult.pattern_description,
        notification_hook: patternResult.notification_hook,
        detected_by: "llm",
        transaction_count: transactions.length,
      },
      priority: patternResult.priority || 5,
      cooldown_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day cooldown
    });

    return trigger ? [trigger] : [];
  } catch (error) {
    console.error("[PATTERN_DETECTION] Error in LLM pattern detection:", error);
    return [];
  }
}

/**
 * Create a notification trigger in the database
 */
async function createTrigger(userId, { trigger_type, trigger_metadata, priority, cooldown_until }) {
  try {
    const { data, error } = await supabase
      .from("notification_triggers")
      .insert({
        user_id: userId,
        trigger_type,
        trigger_metadata: trigger_metadata || {},
        priority: priority || 5,
        cooldown_until: cooldown_until || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[PATTERN_DETECTION] Error creating ${trigger_type} trigger:`, error);
      return null;
    }

    return data?.id;
  } catch (error) {
    console.error("[PATTERN_DETECTION] Error creating trigger:", error);
    return null;
  }
}

