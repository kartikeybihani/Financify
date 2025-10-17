/**
 * Off-topic Memory Extraction Test
 * - Calls validateMemoriesWithSmallModel directly with no hints and off-topic style usage
 * - Prints extracted memories and evidence
 *
 * Usage:
 *   node test_offtopic_memory.js "I'm a 20 year old studying cs and finance"
 *   OPENROUTER_GROK_KEY=sk-or-... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node test_offtopic_memory.js "..."
 */

// import dotenv from "dotenv";
// dotenv.config();

import { validateMemoriesWithSmallModel } from "./api/finny.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const message = args.join(" ") || "I'm a 20 year old studying cs and finance";
  return { message };
}

async function main() {
  const { message } = parseArgs();

  console.log("\n=== Off-topic Memory Extraction Test ===\n");
  console.log("Input:", message);

  try {
    // Off-topic path always uses LLM, no hints, intent ask_personalized
    const memories = await validateMemoriesWithSmallModel(
      message,
      [],
      "ask_personalized"
    );

    console.log("\nExtracted memories (validator):");
    if (!memories || memories.length === 0) {
      console.log("  (none)");
    } else {
      for (const m of memories) {
        console.log(
          `  - ${m.type}.${m.key} = ${m.value} (conf=${
            m.confidence ?? m.confidence_score ?? "?"
          })`
        );
        if (Array.isArray(m.evidence) && m.evidence.length > 0) {
          console.log("    evidence:", m.evidence.join(" | "));
        }
      }
    }
  } catch (e) {
    console.error("Test failed:", e?.message || e);
    process.exit(1);
  }
}

if (
  typeof window === "undefined" &&
  import.meta.url === `file://${process.argv[1]}`
) {
  main();
}
