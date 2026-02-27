// core/finny/infrastructure/database/repositories/NetWorthRepository.js

import { SupabaseClient } from "../SupabaseClient.js";

export class NetWorthRepository {
  constructor(db = new SupabaseClient()) {
    this.db = db;
  }

  async getNetWorth(userId, timeoutMs = 3000) {
    if (!userId) return { data: null, error: new Error("Missing userId") };
    return this.db.rpc("get_net_worth", { p_user_id: userId }, timeoutMs, null);
  }
}

