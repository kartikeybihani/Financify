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

export interface Holding {
  security_id: string;
  institution_value: number;
}

export interface Security {
  security_id: string;
  name: string;
  ticker_symbol?: string;
}

export interface Investments {
  holdings?: Holding[];
  securities?: Security[];
} 