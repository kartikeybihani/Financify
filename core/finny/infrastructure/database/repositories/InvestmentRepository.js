// core/finny/infrastructure/database/repositories/InvestmentRepository.js

import { SupabaseClient } from "../SupabaseClient.js";

export class InvestmentRepository {
  constructor(db = new SupabaseClient()) {
    this.db = db;
  }

  async getDetailedHoldings(userId, timeoutMs = 3000) {
    if (!userId) return { data: null, error: new Error("Missing userId") };
    return this.db.rpc(
      "get_investment_holdings_detailed",
      { p_user_id: userId },
      timeoutMs,
      null,
    );
  }
}

