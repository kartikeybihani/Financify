// app/utils/txPreview.ts
import { 
  cacheGet, 
  cacheSet, 
  txPreviewKey, 
  balancesKey, 
  institutionKey,
  TX_TTL, 
  BAL_TTL, 
  INST_TTL 
} from "../cache/cache";
import { SlimTransaction } from "@/src/utils/core/supabase";

// Stale while revalidate pattern for transaction preview
export async function loadTxPreview(
  userId: string,
  itemId: string,
  fetcher: () => Promise<SlimTransaction[]>,
  onData: (rows: SlimTransaction[]) => void
) {
  const cacheKey = txPreviewKey(userId, itemId);

  // Return cached data immediately if available (stale)
  const cached = await cacheGet<SlimTransaction[]>(cacheKey);
  if (cached) {
    onData(cached);
  }

  try {
    // Fetch fresh data (revalidate)
    const fresh = await fetcher();
    const rows = fresh.slice(0, 50); // enforce cap
    
    // Cache fresh data
    await cacheSet(cacheKey, rows, TX_TTL);
    
    // Update UI with fresh data
    onData(rows);
  } catch (error) {
    console.error("Error fetching fresh transaction preview:", error);
    // If we had cached data, we already returned it above
    // If no cached data and fetch fails, onData won't be called with fresh data
  }
}

// Cache balances with SWR pattern
export async function loadBalances(
  userId: string,
  itemId: string, 
  fetcher: () => Promise<any>, 
  onData: (v: any) => void
) {
  const key = balancesKey(userId, itemId);
  
  const cached = await cacheGet<any>(key);
  if (cached) onData(cached);
  
  try {
    const fresh = await fetcher();
    await cacheSet(key, fresh, BAL_TTL);
    onData(fresh);
  } catch (error) {
    console.error("Error fetching balances:", error);
  }
}

// Cache institution with SWR pattern
export async function loadInstitution(
  userId: string,
  itemId: string, 
  fetcher: () => Promise<any>, 
  onData: (v: any) => void
) {
  const key = institutionKey(userId, itemId);
  
  const cached = await cacheGet<any>(key);
  if (cached) onData(cached);
  
  try {
    const fresh = await fetcher();
    await cacheSet(key, fresh, INST_TTL);
    onData(fresh);
  } catch (error) {
    console.error("Error fetching institution:", error);
  }
}
