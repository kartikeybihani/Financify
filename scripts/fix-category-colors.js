/**
 * Fix category colors in the database.
 * Updates categories with wrong colors (e.g. old #4A90E2 default) to use
 * the correct color from the name-to-color map or hash-based color for unknowns.
 *
 * Run: node scripts/fix-category-colors.js [--dry-run|--live]
 */

import { createClient } from "@supabase/supabase-js";
import { getColorForCategoryName } from "../lib/categoryColors.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: Supabase credentials not found");
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) environment variables"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixCategoryColors(dryRun = true) {
  console.log(
    `\n🎨 Fixing category colors (${dryRun ? "DRY RUN" : "LIVE"})...\n`
  );

  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, user_id, name, color")
    .eq("is_active", true);

  if (error) {
    console.error("❌ Failed to fetch categories:", error.message);
    process.exit(1);
  }

  const toUpdate = [];
  for (const cat of categories || []) {
    const expectedColor = getColorForCategoryName(cat.name);
    if (cat.color !== expectedColor) {
      toUpdate.push({
        id: cat.id,
        name: cat.name,
        oldColor: cat.color,
        newColor: expectedColor,
      });
    }
  }

  console.log(`Found ${categories?.length || 0} categories`);
  console.log(`${toUpdate.length} need color updates\n`);

  if (toUpdate.length === 0) {
    console.log("✅ All category colors are already correct.");
    return;
  }

  // Show sample of changes
  const sample = toUpdate.slice(0, 15);
  console.log("Sample of updates:");
  for (const u of sample) {
    console.log(`  ${u.name}: ${u.oldColor} → ${u.newColor}`);
  }
  if (toUpdate.length > 15) {
    console.log(`  ... and ${toUpdate.length - 15} more`);
  }

  if (dryRun) {
    console.log("\n🔒 Dry run - no changes made. Use --live to apply.");
    return;
  }

  console.log("\n📤 Applying updates...");

  let updated = 0;
  let failed = 0;

  for (const u of toUpdate) {
    const { error: updateError } = await supabase
      .from("categories")
      .update({ color: u.newColor })
      .eq("id", u.id);

    if (updateError) {
      console.error(`  ❌ ${u.name}: ${updateError.message}`);
      failed++;
    } else {
      updated++;
      if (updated <= 10 || updated % 50 === 0) {
        console.log(`  ✓ ${u.name}`);
      }
    }
  }

  console.log(`\n✅ Updated ${updated} categories${failed ? `, ${failed} failed` : ""}`);
}

const args = process.argv.slice(2);
const live = args.includes("--live");
const dryRun = !live;

fixCategoryColors(dryRun).catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
