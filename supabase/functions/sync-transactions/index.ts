/// <reference types="https://deno.land/x/supabase_functions/mod.ts" />
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Plaid API configuration using native fetch
const PLAID_ENV = Deno.env.get("PLAID_ENV") || "sandbox";
const PLAID_BASE_URL = PLAID_ENV === "production" 
  ? "https://production.plaid.com" 
  : "https://sandbox.plaid.com";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID")!;
const PLAID_SECRET = Deno.env.get("PLAID_SECRET")!;

// Category mapping utility using database categories
interface Category {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  icon: string;
  color: string;
  rank: number;
  is_active: boolean;
}

// Cache for categories to avoid repeated DB calls during sync
let categoriesCache: Category[] | null = null;

/**
 * Fetch categories from database
 */
async function getCategories(): Promise<Category[]> {
  if (categoriesCache) {
    return categoriesCache;
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .is('user_id', null) // Only get default categories for sync
      .eq('is_active', true)
      .order('rank', { ascending: true });

    if (error) {
      console.error('Error fetching categories:', error);
      return getDefaultCategories();
    }

    categoriesCache = data || [];
    return categoriesCache;
  } catch (error) {
    console.error('Category fetch error:', error);
    return getDefaultCategories();
  }
}

/**
 * Map Plaid category to database category name
 */
async function mapPlaidCategory(plaidCategory: string | null | undefined): Promise<string> {
  if (!plaidCategory) {
    return 'Other';
  }

  const categories = await getCategories();
  const upperCategory = plaidCategory.toUpperCase();
  
  // Food-related mappings
  if (upperCategory.includes('FOOD') || upperCategory.includes('RESTAURANT') || upperCategory.includes('COFFEE')) {
    if (upperCategory.includes('GROCERY') || upperCategory.includes('SUPERMARKET')) {
      return findCategoryByName(categories, 'Groceries') || 'Groceries';
    }
    return findCategoryByName(categories, 'Food') || findCategoryByName(categories, 'Dining Out') || 'Food';
  }
  
  // Grocery specific
  if (upperCategory.includes('GROCERY') || upperCategory.includes('SUPERMARKET')) {
    return findCategoryByName(categories, 'Groceries') || 'Groceries';
  }
  
  // Transportation
  if (upperCategory.includes('TRANSPORT') || upperCategory.includes('GAS') || upperCategory.includes('UBER') || upperCategory.includes('LYFT')) {
    return findCategoryByName(categories, 'Transportation') || 'Transportation';
  }
  
  // Shopping
  if (upperCategory.includes('SHOPPING') || upperCategory.includes('MERCHANDISE') || upperCategory.includes('AMAZON')) {
    return findCategoryByName(categories, 'Shopping') || 'Shopping';
  }
  
  // Entertainment
  if (upperCategory.includes('ENTERTAINMENT') || upperCategory.includes('MOVIE') || upperCategory.includes('GAME')) {
    return findCategoryByName(categories, 'Entertainment') || 'Entertainment';
  }
  
  // Travel
  if (upperCategory.includes('TRAVEL') || upperCategory.includes('FLIGHT') || upperCategory.includes('HOTEL')) {
    return findCategoryByName(categories, 'Travel') || 'Travel';
  }
  
  // Income
  if (upperCategory.includes('INCOME') || upperCategory.includes('WAGE') || upperCategory.includes('SALARY')) {
    return findCategoryByName(categories, 'Income') || 'Income';
  }
  
  // Housing
  if (upperCategory.includes('RENT') || upperCategory.includes('MORTGAGE') || upperCategory.includes('UTILITIES')) {
    return findCategoryByName(categories, 'Housing') || 'Housing';
  }
  
  // Health & Fitness
  if (upperCategory.includes('HEALTH') || upperCategory.includes('MEDICAL') || upperCategory.includes('PHARMACY') || upperCategory.includes('FITNESS')) {
    return findCategoryByName(categories, 'Health & Fitness') || 'Health & Fitness';
  }
  
  // Personal Care
  if (upperCategory.includes('PERSONAL_CARE') || upperCategory.includes('BEAUTY') || upperCategory.includes('HAIR')) {
    return findCategoryByName(categories, 'Personal Care') || 'Personal Care';
  }
  
  // Bills & Utilities
  if (upperCategory.includes('UTILITIES') || upperCategory.includes('PHONE') || upperCategory.includes('INTERNET')) {
    return findCategoryByName(categories, 'Bills & Utilities') || 'Bills & Utilities';
  }
  
  // Subscriptions
  if (upperCategory.includes('SUBSCRIPTION') || upperCategory.includes('STREAMING')) {
    return findCategoryByName(categories, 'Subscriptions') || 'Subscriptions';
  }
  
  // Education
  if (upperCategory.includes('EDUCATION') || upperCategory.includes('STUDENT') || upperCategory.includes('SCHOOL')) {
    return findCategoryByName(categories, 'Education') || 'Education';
  }
  
  // Savings & Investments
  if (upperCategory.includes('INVESTMENT') || upperCategory.includes('SAVINGS') || upperCategory.includes('TRANSFER')) {
    return findCategoryByName(categories, 'Savings & Investments') || 'Savings & Investments';
  }
  
  // Default fallback
  return findCategoryByName(categories, 'Other') || 'Other';
}

/**
 * Helper function to find category by name
 */
function findCategoryByName(categories: Category[], name: string): string | null {
  const category = categories.find(cat => 
    cat.name.toLowerCase() === name.toLowerCase() ||
    cat.slug === name.toLowerCase().replace(/\s+/g, '-')
  );
  return category?.name || null;
}

/**
 * Fallback categories if database is unavailable
 */
function getDefaultCategories(): Category[] {
  return [
    { id: '1', user_id: null, name: 'Groceries', slug: 'groceries', icon: 'basket', color: '#4CAF50', rank: 1, is_active: true },
    { id: '2', user_id: null, name: 'Food', slug: 'food', icon: 'restaurant', color: '#FF6B6B', rank: 2, is_active: true },
    { id: '3', user_id: null, name: 'Housing', slug: 'housing', icon: 'home', color: '#8E44AD', rank: 3, is_active: true },
    { id: '4', user_id: null, name: 'Transportation', slug: 'transportation', icon: 'car', color: '#45B7D1', rank: 4, is_active: true },
    { id: '5', user_id: null, name: 'Shopping', slug: 'shopping', icon: 'storefront', color: '#4ECDC4', rank: 5, is_active: true },
    { id: '6', user_id: null, name: 'Entertainment', slug: 'entertainment', icon: 'game-controller', color: '#96CEB4', rank: 6, is_active: true },
    { id: '7', user_id: null, name: 'Other', slug: 'other', icon: 'apps', color: '#607D8B', rank: 15, is_active: true },
  ];
}

// Helper function to call Plaid API using fetch
async function callPlaidAPI(endpoint: string, body: any) {
  const response = await fetch(`${PLAID_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Plaid API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

serve(async (req: Request) => {
  try {
    console.log("🔄 Starting transaction sync...");
    
    const { item_id, user_id } = (await req.json()) as {
      item_id: string;
      user_id: string;
    };
    
    console.log("📋 Sync request:", { item_id, user_id: user_id.substring(0, 8) + "..." });
    
    if (!item_id || !user_id) {
      console.error("❌ Missing required parameters");
      return new Response("Missing item_id or user_id", { status: 400 });
    }

    // Skip SnapTrade investment accounts (they start with "snaptrade-")
    if (item_id.startsWith('snaptrade-')) {
      console.log(`🚫 Skipping SnapTrade investment account: ${item_id}`);
      return new Response(JSON.stringify({
        message: "SnapTrade account skipped",
        added: 0,
        modified: 0,
        removed: 0,
        skipped: true
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. Fetch cursor from DB
    console.log("🔍 Fetching cursor from database...");
    const { data: ui, error: fetchErr } = await supabase
      .from("user_items")
      .select("transactions_cursor")
      .eq("item_id", item_id)
      .single();

    if (fetchErr || !ui) {
      console.error("❌ Item not found:", fetchErr);
      return new Response("Item not found", { status: 404 });
    }

    console.log("📍 Current cursor:", ui.transactions_cursor || "null (first sync)");

    // 2. Get decrypted access token from Vault via RPC
    console.log("🔑 Fetching access token from Vault...");
    const { data: access_token, error: tokenErr } = await supabase.rpc("secure_get_plaid_token", {
      p_item_id: item_id, 
      p_user_id: user_id
    });

    if (tokenErr || !access_token) {
      console.error("❌ Vault token fetch failed:", tokenErr);
      return new Response("Token not found", { status: 404 });
    }

    console.log("✅ Access token retrieved from Vault");

    // 3. Pull all pages with transactionsSync using fetch
    let cursor: string | null = ui.transactions_cursor || null;
    let added: any[] = [];
    let modified: any[] = [];
    let removed: any[] = [];
    let hasMore = true;
    let pageCount = 0;

    console.log("📥 Starting transaction sync with Plaid API...");

    while (hasMore) {
      pageCount++;
      console.log(`📄 Fetching page ${pageCount}...`);
      
      const syncBody: any = {
        access_token,
        count: 500,
      };
      
      if (cursor) {
        syncBody.cursor = cursor;
      }

      const data = await callPlaidAPI("/transactions/sync", syncBody);
      
      console.log(`📊 Page ${pageCount} results:`, {
        added: data.added?.length || 0,
        modified: data.modified?.length || 0,
        removed: data.removed?.length || 0,
        has_more: data.has_more
      });
      
      added.push(...(data.added || []));
      modified.push(...(data.modified || []));
      removed.push(...(data.removed || []));
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    console.log(`✅ Sync complete! Total: ${added.length} added, ${modified.length} modified, ${removed.length} removed`);

    // 4. Save new cursor and last_synced_at timestamp
    console.log("💾 Updating cursor in database...");
    const { error: cursorUpdateErr } = await supabase
      .from("user_items")
      .update({ 
        transactions_cursor: cursor,
        last_synced_at: new Date().toISOString()
      })
      .eq("item_id", item_id);

    if (cursorUpdateErr) {
      console.error("❌ Failed to update cursor:", cursorUpdateErr);
      return new Response("Failed to update cursor", { status: 500 });
    }

    console.log("✅ Cursor updated successfully");

    // 5. Upsert new and modified transactions into database
    if (added.length || modified.length) {
      console.log(`💽 Saving ${added.length + modified.length} transactions to database...`);
      
      const rows = await Promise.all([...added, ...modified].map(async (txn) => {
        const category = txn.personal_finance_category?.primary || null;
        
        // Apply category mapping to get database category
        const mappedCategory = await mapPlaidCategory(category);
        
        // Debug log for categories
        if (added.length <= 5) { // Only log first few to avoid spam
          console.log(`🏷️ Transaction: "${txn.name}" → Original: "${category}" → Mapped: "${mappedCategory}"`);
        }
        
        return {
          user_id,
          account_id: txn.account_id, // must exist in public.accounts due to FK
          plaid_transaction_id: txn.transaction_id,
          date: txn.date,
          amount: txn.amount,
          iso_currency_code: txn.iso_currency_code || null,
          name: txn.name || null,
          merchant_name: txn.merchant_name || null,
          category: category, // Keep original Plaid category
          top_category: mappedCategory, // Use database category name
          sub_category: null, // We'll implement sub-categories later
          transaction_type: txn.transaction_type || null,
          pending: txn.pending ?? false,
        };
      }));

      const { error: upsertErr } = await supabase
        .from("transactions")
        .upsert(rows, { onConflict: "plaid_transaction_id" });

      if (upsertErr) {
        console.error("❌ Transaction upsert error:", upsertErr);
        return new Response("Failed to save transactions", { status: 500 });
      }
      
      console.log("✅ Transactions saved successfully");
    } else {
      console.log("ℹ️ No transactions to save");
    }

    // 6. Delete removed transactions
    if (removed.length) {
      console.log(`🗑️ Removing ${removed.length} deleted transactions...`);
      
      const { error: deleteErr } = await supabase
        .from("transactions")
        .delete()
        .in("plaid_transaction_id", removed.map((r) => r.transaction_id));

      if (deleteErr) {
        console.error("❌ Failed to delete transactions:", deleteErr);
        // Don't fail the whole operation for delete errors
      } else {
        console.log("✅ Deleted transactions removed successfully");
      }
    }

    const summary = {
      message: "Sync complete",
      added: added.length,
      modified: modified.length,
      removed: removed.length,
      item_id,
    };

    console.log("🎉 Transaction sync completed successfully:", summary);

    // 7. Return summary
    return new Response(
      JSON.stringify(summary),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("❌ Sync error:", error);
    
    const errorResponse = {
      error: "Sync failed",
      details: (error as Error).message,
      item_id: (error as any)?.item_id || "unknown",
    };

    return new Response(
      JSON.stringify(errorResponse),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
