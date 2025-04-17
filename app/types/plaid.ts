// Basic interfaces
export interface Account {
  name: string;
  subtype: string;
  balances: {
    current: number;
  };
  type: string;
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