import { Ionicons } from "@expo/vector-icons";

// Basic interfaces
export interface Account {
  account_id: string;
  item_id?: string; // Plaid items: UUID; Snaptrade: "snaptrade-..."
  name: string;
  subtype: string;
  type: string;
  mask?: string;
  official_name?: string;
  institution_name?: string;
  current_balance?: number;
  available_balance?: number;
  balances?: {
    current: number;
    available: number;
  };
}

// Transaction interface - shared across all components
export interface Transaction {
  id?: string;
  amount: number;
  category?: string; // Original Plaid category stored as string
  top_category?: string; // Simplified top-level category (e.g., "Food", "Transportation")
  sub_category?: string; // Simplified sub-category (e.g., "Eating Out", "Groceries")
  new_category?: string; // User-overridden category (legacy - use category_id instead)
  transaction_type?: string | null;
  category_id?: string | null; // Reference to categories table (preferred way to get category name)
  date: string; // Posted date (when transaction was posted to account)
  authorized_date?: string | null; // Authorization date (when user actually made the transaction) - optional
  name: string;
  personal_finance_category?: {
    primary: string;
  };
  plaid_transaction_id?: string;
  account_id?: string;
  account_name?: string;
  institution_name?: string;
  account_mask?: string;
  account_type?: string;
  if_recurring?: string;
  merchant_name?: string;
  recurring_stream_id?: string; // Link to recurring stream if applicable
  recurring_streams?: RecurringStream[]; // Joined recurring stream data from database
  categories?: { // Joined category data from database (when category_id is populated)
    id: string;
    name: string;
    slug?: string | null;
    icon?: string | null;
    color?: string | null;
  } | null;
  is_reviewed?: boolean; // Whether the transaction has been reviewed by the user
  inserted_at?: string; // When the transaction was inserted into the database
}

// RecurringStream interface - shared across all components
export interface RecurringStream {
  stream_id: string;
  description: string;
  merchant_name?: string;
  category: string;
  stream_type?: string; // Type of recurring stream: subscription, bill, income, other
  frequency: string;
  average_amount: number; // negative for inflow per Plaid
  last_amount: number;
  last_date: string;
  first_date: string;
  is_active: boolean;
  account_id: string;
  transaction_ids: string[];
  iso_currency_code: string;
  user_dismissed?: boolean; // When true, user explicitly removed from recurring (in Past section)
}

// Extended Transaction interface for recurring streams with account details
export interface RecurringTransaction extends Transaction {
  accounts?: {
    name: string;
    mask?: string;
    type: string;
    subtype: string;
    user_items?: {
      institution_name: string;
    };
  };
}

// Investment Performance interface
export interface InvestmentPerformance {
  todayPerformance: {
    amount: number;
    percentage: number;
  };
  totalPerformance: {
    amount: number;
    percentage: number;
  };
}

// Account Detail Modal Props interface
export interface AccountDetailModalProps {
  visible: boolean;
  accountId: string | null;
  account?: Account | null;
  onClose: () => void;
  loading?: boolean;
  investmentPerformance?: InvestmentPerformance | null;
}

// Transaction Detail Modal Props interface
export interface TransactionDetailModalProps {
  visible: boolean;
  transactionId: string | null;
  transaction?: Transaction | null; // Pass transaction data directly to avoid DB call
  onClose: () => void;
}

// Memory Summary interface
export interface MemorySummary {
  id: string;
  summary_text: string;
  created_at: string;
  title?: string; // Optional title from Supermemory document list
  summary?: string; // Optional summary from Supermemory document list
}

// Memories Screen Props interface
export interface MemoriesScreenProps {
  onBack?: () => void;
}

// Setting Item Props interface
export interface SettingItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showBorder?: boolean;
}

// Category Breakdown interface
export interface CategoryBreakdown {
  [key: string]: {
    amount: number;
    percentage: number;
    color: string;
    hasRecurringTransactions: boolean;
  };
}

// Insight interface
export interface Insight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  details: string;
}

export interface Identity {
  owners?: Array<{
    names?: string[];
  }>;
}

// Investment related interfaces
export interface Holding {
  security_id: string;
  institution_value: number;
}

export interface Security {
  security_id: string;
  name: string;
  ticker_symbol?: string;
}

export interface InvestmentTransaction {
  account_id: string;
  security_id: string;
  value: number;
  quantity: number;
  price: number;
  type: string;
}

export interface Investment {
  holdings: Holding[];
  securities: Security[];
  investmentTransactions: InvestmentTransaction[];
}

// Liability interface
export interface Liability {
  account_id: string;
  type: string;
  balance: number;
  interest_rate?: number;
  last_payment_amount?: number;
  last_payment_date?: string;
  minimum_payment?: number;
  next_payment_due_date?: string;
}

// Main data interface that combines everything
export interface FinancialData {
  institution?: {
    name: string;
    institution_id: string;
  };
  accounts?: Account[];
  identity?: Identity;
  investments?: Investment;
  liabilities?: Liability[];
}

export default {}; 
