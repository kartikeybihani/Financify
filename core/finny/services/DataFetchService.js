// core/finny/services/DataFetchService.js
// Phase 3 data-layer service. Uses repositories and avoids duplicate Supabase clients.

import { NetWorthRepository } from "../infrastructure/database/repositories/NetWorthRepository.js";
import { InvestmentRepository } from "../infrastructure/database/repositories/InvestmentRepository.js";

export class DataFetchService {
  constructor({
    netWorthRepository = new NetWorthRepository(),
    investmentRepository = new InvestmentRepository(),
  } = {}) {
    this.netWorthRepository = netWorthRepository;
    this.investmentRepository = investmentRepository;
  }

  async getNetWorth(userId, timeoutMs = 3000) {
    return this.netWorthRepository.getNetWorth(userId, timeoutMs);
  }

  async getInvestmentHoldingsDetailed(userId, timeoutMs = 3000) {
    return this.investmentRepository.getDetailedHoldings(userId, timeoutMs);
  }
}

