export interface Account {
  account_id: string;
  name: string;
  mask?: string;
  institution_name: string;
  type: string;
  subtype: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface FilterOptions {
  accountIds: string[]; // empty array means "All Accounts"
  timePeriod: string;
  categoryIds: string[]; // empty array means "All Categories"
}

export interface EnhancedFilterModalProps {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  categories?: Category[];
  selectedFilters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
}

export interface TimePeriod {
  id: string;
  label: string;
  emoji: string;
  description: string;
  year?: number;
}

export interface MonthData {
  name: string;
  emoji: string;
}
