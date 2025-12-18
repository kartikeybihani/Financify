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
    // Check if user already has categories
    const { data: existingCategories, error: checkError } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (checkError) {
      console.error("Error checking existing categories:", checkError);
      return false;
    }

    // If user already has categories, don't seed
    if (existingCategories && existingCategories.length > 0) {
      console.log("User already has categories, skipping seed");
      return true;
    }

    // Generate UUIDs and insert default categories
    const categoriesToInsert = DEFAULT_CATEGORIES.map((cat) => ({
      id: generateUUID(),
      user_id: userId,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      rank: cat.rank,
      is_active: true,
    }));

    const { error: insertError } = await supabase
      .from("categories")
      .insert(categoriesToInsert);

    if (insertError) {
      console.error("Error seeding default categories:", insertError);
      return false;
    }

    console.log(`✅ Seeded ${categoriesToInsert.length} default categories for user ${userId}`);
    return true;
  } catch (error) {
    console.error("Exception seeding default categories:", error);
    return false;
  }
}

