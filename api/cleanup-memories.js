import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Delete expired memories
    const { error: deleteError } = await supabase
      .from("user_memories")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (deleteError) throw deleteError;

    // Regenerate summaries for users with expired memories
    const { data: affectedUsers } = await supabase
      .from("user_memories")
      .select("user_id")
      .lt("expires_at", new Date().toISOString())
      .limit(100);

    if (affectedUsers) {
      const uniqueUsers = [...new Set(affectedUsers.map((u) => u.user_id))];
      for (const userId of uniqueUsers) {
        await updateMemorySummary(userId);
      }
    }

    res.json({ success: true, cleaned: affectedUsers?.length || 0 });
  } catch (error) {
    console.error("Memory cleanup failed:", error);
    res.status(500).json({ error: "Cleanup failed" });
  }
}

async function updateMemorySummary(userId) {
  try {
    const { data: memories } = await supabase
      .from("user_memories")
      .select("memory_type, key, value")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (!memories?.length) return;

    const summary = generateMemorySummary(memories);

    await supabase.from("memory_summary").upsert({
      user_id: userId,
      summary_text: summary,
    });
  } catch (error) {
    console.error("Memory summary update failed:", error);
  }
}

function generateMemorySummary(memories) {
  const traits = memories.filter((m) => m.memory_type === "profile_trait");
  const constraints = memories.filter((m) => m.memory_type === "constraint");
  const preferences = memories.filter((m) => m.memory_type === "preference");
  const futurePlans = memories.filter((m) => m.memory_type === "future_plan");

  const parts = [];

  if (traits.length) {
    parts.push(
      `Profile: ${traits.map((t) => `${t.key} (${t.value})`).join(", ")}`
    );
  }

  if (constraints.length) {
    parts.push(
      `Constraints: ${constraints
        .map((c) => `${c.key} (${c.value})`)
        .join(", ")}`
    );
  }

  if (preferences.length) {
    parts.push(
      `Preferences: ${preferences
        .map((p) => `${p.key} (${p.value})`)
        .join(", ")}`
    );
  }

  if (futurePlans.length) {
    parts.push(
      `Future plans: ${futurePlans
        .map((f) => `${f.key} (${f.value})`)
        .join(", ")}`
    );
  }

  return parts.join(". ");
}
