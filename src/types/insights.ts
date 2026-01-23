import { Transaction, RecurringStream } from "./plaid";
import { FilterOptions, Account } from "@/src/components/EnhancedFilterModal";
import { MonthOption } from "@/src/components/insights/components/MonthSelector";

export type InsightsSection =
  | "investments"
  | "spending"
  | "transactions"
  | "recurring"
  | "cashflow";

export interface ReAuthItem {
  item_id: string;
  institution_name: string;
  dismissed: boolean;
  type?: "re_auth" | "new_accounts";
}

export interface RecurringData {
  subscriptions: RecurringStream[];
  income: RecurringStream[];
  bills: RecurringStream[];
  other: RecurringStream[];
  summary: {
    subscriptions: number;
    income: number;
    bills: number;
    other: number;
    total: number;
  };
}

export interface RefreshStatus {
  type: "cloud" | null;
  message: string;
}

export interface SyncStatus {
  lastSync: string | null;
  nextSync: string | null;
  isAutomated: boolean;
}

export interface CategoryDetailData {
  category: string;
  data: {
    amount: number;
    percentage: number;
    color: string;
    hasRecurringTransactions: boolean;
  };
}

export interface InitialCache {
  transactions: Transaction[];
  hasCache: boolean;
}

export interface SectionAnimations {
  spending: any;
  transactions: any;
  recurring: any;
  investments: any;
  cashflow: any;
}

export interface FilterCacheEntry {
  transactions: Transaction[];
  count: number;
  timestamp: number;
}

export interface SearchCacheEntry {
  transactions: Transaction[];
  count: number;
  timestamp: number;
}

export interface UserBehavior {
  lastActiveSection: InsightsSection;
  lastFilterOptions: FilterOptions;
}

export interface InvestmentData {
  holdings: any[];
  options: any[];
  balances: any[];
  connections: any[];
}
