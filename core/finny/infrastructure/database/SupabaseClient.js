// core/finny/infrastructure/database/SupabaseClient.js
// Thin wrapper around the existing shared Supabase client in lib/api/supabase.js

import { supabase } from "../../../../lib/api/supabase.js";
import { withTimeout } from "../../utils/timeout.js";

export class SupabaseClient {
  constructor(client = supabase) {
    this.client = client;
  }

  from(table) {
    return this.client.from(table);
  }

  async rpc(name, params = {}, timeoutMs = 0, onTimeoutValue = null) {
    const query = this.client.rpc(name, params);
    if (timeoutMs > 0) {
      return withTimeout(query, timeoutMs, onTimeoutValue);
    }
    return query;
  }
}

