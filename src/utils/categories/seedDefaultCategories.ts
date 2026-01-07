// Utility function to seed default categories for new users
import { supabase } from "@/src/lib/supabase/supabase";
import { generateUUID } from "@/src/utils/core/uuid";

const DEFAULT_CATEGORIES = [
  { name: "Food", slug: "food", icon: "🍔", color: "#FF6B6B", rank: 1 },
  { name: "Groceries", slug: "groceries", icon: "🛒", color: "#4CAF50", rank: 2 },
  { name: "Housing", slug: "housing", icon: "🏠", color: "#8E44AD", rank: 3 },
  { name: "Transportation", slug: "transportation", icon: "🚗", color: "#45B7D1", rank: 4 },
  { name: "Shopping", slug: "shopping", icon: "🛍️", color: "#4ECDC4", rank: 5 },
  { name: "Entertainment", slug: "entertainment", icon: "🎬", color: "#96CEB4", rank: 6 },
  { name: "Health", slug: "health", icon: "💪", color: "#2E7D32", rank: 7 },
  { name: "Travel", slug: "travel", icon: "✈️", color: "#2196F3", rank: 8 },
  { name: "Personal Care", slug: "personal-care", icon: "💄", color: "#E91E63", rank: 9 },
  { name: "Income", slug: "income", icon: "💰", color: "#1B5E20", rank: 10 },
  { name: "Savings", slug: "savings", icon: "💎", color: "#27AE60", rank: 11 },
  { name: "Other", slug: "other", icon: "📦", color: "#607D8B", rank: 12 },
];

/**
 * Seed default categories for a new user
 * @param userId - The user ID to create categories for
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export async function seedDefaultCategories(userId: string): Promise<boolean> {
  if (!userId) {
    console.error("seedDefaultCategories - userId is required");
    return false;
  }

  try {
    // Get existing category slugs for this user to avoid duplicates
    // This single query is more efficient than checking count first
    const { data: existingCategorySlugs, error: slugsError } = await supabase
      .from("categories")
      .select("slug")
      .eq("user_id", userId);

    if (slugsError) {
      console.error("Error checking existing category slugs:", slugsError);
      return false;
    }

    const existingSlugs = new Set(
      (existingCategorySlugs || []).map((cat) => cat.slug)
    );

    // If user already has all default categories, don't seed
    const allSlugsExist = DEFAULT_CATEGORIES.every((cat) =>
      existingSlugs.has(cat.slug)
    );
    if (allSlugsExist) {
      console.log("User already has all default categories, skipping seed");
      return true;
    }

    // Insert only categories that don't exist yet
    // This prevents duplicate key errors even in race conditions
    let successCount = 0;
    let errorCount = 0;

    for (const cat of DEFAULT_CATEGORIES) {
      // Skip if this category already exists
      if (existingSlugs.has(cat.slug)) {
        continue;
      }

      const categoryData = {
        id: generateUUID(),
        user_id: userId,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        color: cat.color,
        rank: cat.rank,
        is_active: true,
      };

      const { error: insertError } = await supabase
        .from("categories")
        .insert(categoryData);

      if (insertError) {
        // If it's a duplicate key error (race condition), that's okay
        if (
          insertError.code === "23505" ||
          insertError.message.includes("duplicate key") ||
          insertError.message.includes("already exists") ||
          insertError.message.includes("categories_user_slug_unique")
        ) {
          // Category was created by another concurrent call, skip it
          console.log(`Category ${cat.slug} already exists (race condition)`);
          continue;
        } else {
          // Some other error occurred
          console.error(
            `Error inserting category ${cat.slug}:`,
            insertError
          );
          errorCount++;
        }
      } else {
        successCount++;
      }
    }

    if (errorCount > 0 && successCount === 0) {
      // All inserts failed with non-duplicate errors
      return false;
    }

    // Success if at least some categories were inserted or already existed
    const skippedCount = DEFAULT_CATEGORIES.length - successCount;
    if (successCount > 0) {
      console.log(
        `✅ Seeded ${successCount} new categories for user ${userId}${skippedCount > 0 ? ` (${skippedCount} already existed)` : ""}`
      );
    }

    return true;
  } catch (error) {
    console.error("Exception seeding default categories:", error);
    return false;
  }
}

