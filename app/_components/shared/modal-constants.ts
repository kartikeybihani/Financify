import { Platform } from "react-native";

// Modal constants and logo configuration
export const MODAL_CONFIG = {
  BLUR_INTENSITY: 30,
  OVERLAY_BACKGROUND: "#121212",
  SHEET_BACKGROUND: "#121212",
  PADDING_BOTTOM: 30,
};

// Institution interface
export interface Institution {
  id: string;
  name: string;
  color: string;
  initials: string;
}

// Institution logo asset mapping
export const INSTITUTION_LOGO_MAP: Record<string, any> = {
  fidelity: require("../../../assets/invest_logo/fidelity.png"),
  wells_fargo: require("../../../assets/invest_logo/wellsfargo.png"),
  alpaca: require("../../../assets/invest_logo/alpaca.png"),
  charles_schwab: require("../../../assets/invest_logo/charles.png"),
  coinbase: require("../../../assets/invest_logo/coinbase.png"),
  etrade: require("../../../assets/invest_logo/etrade.png"),
  interactive_brokers: require("../../../assets/invest_logo/ib.png"),
  public: require("../../../assets/invest_logo/public.png"),
  robinhood: require("../../../assets/invest_logo/robinhood.png"),
  webull: require("../../../assets/invest_logo/webull.png"),
  american_express: require("../../../assets/invest_logo/amex.png"),
  capital_one: require("../../../assets/invest_logo/capitalone.png"),
  chase: require("../../../assets/invest_logo/chase.png"),
  bank_of_america: require("../../../assets/invest_logo/bofa.png"),
  discover: require("../../../assets/invest_logo/discover.png"),
  citibank: require("../../../assets/invest_logo/citi.png"),
  chime: require("../../../assets/invest_logo/chime.png"),
  venmo: require("../../../assets/invest_logo/venmo.png"),
  us_bank: require("../../../assets/invest_logo/usbank.png"),
};

// Logos that use dark text/mark; use lighter bg for contrast
export const LIGHT_BG_LOGO_IDS = new Set<string>([
  "public",
  "capital_one",
  "etrade",
  "alpaca",
]);

// Investment institutions (for investments & retirement)
export const INVESTMENT_INSTITUTIONS: Institution[] = [
  {
    id: "fidelity",
    name: "Fidelity",
    color: "#00A651",
    initials: "FI",
  },
  {
    id: "wells_fargo",
    name: "Wells Fargo",
    color: "#D71921",
    initials: "WF",
  },
  {
    id: "alpaca",
    name: "Alpaca",
    color: "#FFC107",
    initials: "AL",
  },
  {
    id: "charles_schwab",
    name: "Charles Schwab",
    color: "#00A0DF",
    initials: "CS",
  },
  {
    id: "robinhood",
    name: "Robinhood",
    color: "#00C805",
    initials: "RH",
  },
  {
    id: "coinbase",
    name: "Coinbase",
    color: "#0052FF",
    initials: "CB",
  },
  {
    id: "etrade",
    name: "E*TRADE",
    color: "#9013FE",
    initials: "ET",
  },
  {
    id: "interactive_brokers",
    name: "Interactive Brokers",
    color: "#DC143C",
    initials: "IB",
  },
  {
    id: "public",
    name: "Public",
    color: "#212121",
    initials: "PU",
  },
  {
    id: "webull",
    name: "Webull",
    color: "#1976D2",
    initials: "WB",
  },
];

// Cash deposit institutions (for checking & savings)
export const CASH_DEPOSIT_INSTITUTIONS: Institution[] = [
  {
    id: "american_express",
    name: "American Express",
    color: "#006FCF",
    initials: "AE",
  },
  {
    id: "capital_one",
    name: "Capital One",
    color: "#FF0000",
    initials: "CO",
  },
  {
    id: "chase",
    name: "Chase",
    color: "#117ACA",
    initials: "CH",
  },
  {
    id: "wells_fargo",
    name: "Wells Fargo",
    color: "#D71921",
    initials: "WF",
  },
  {
    id: "bank_of_america",
    name: "Bank of America",
    color: "#E31837",
    initials: "BA",
  },
  {
    id: "chime",
    name: "Chime",
    color: "#32D74B",
    initials: "CM",
  },
  {
    id: "discover",
    name: "Discover",
    color: "#4B4B4B",
    initials: "DC",
  },
  {
    id: "venmo",
    name: "Venmo",
    color: "#0084FF",
    initials: "VN",
  },
  {
    id: "us_bank",
    name: "US Bank",
    color: "#0446AD",
    initials: "US",
  },
  {
    id: "citibank",
    name: "Citibank",
    color: "#056DAE",
    initials: "CB",
  },
  {
    id: "fidelity",
    name: "Fidelity",
    color: "#00A651",
    initials: "FI",
  },
];

// Mapping of institution IDs to Plaid institution IDs
// These are the actual Plaid institution IDs that can be used with linkTokenCreate
export const PLAID_INSTITUTION_ID_MAP: Record<string, string> = {
  american_express: "ins_115616",
  capital_one: "ins_115617", 
  chase: "ins_116944",
  wells_fargo: "ins_127988",
  bank_of_america: "ins_127989",
  chime: "ins_115618",
  discover: "ins_115619",
  venmo: "ins_115620",
  us_bank: "ins_115621",
  citibank: "ins_115622",
  fidelity: "ins_115623",
};

// Helper function to get Plaid institution ID
export const getPlaidInstitutionId = (institutionId: string): string | null => {
  return PLAID_INSTITUTION_ID_MAP[institutionId] || null;
};

// Credit card institutions (for credit cards & loans)
export const CREDIT_CARD_INSTITUTIONS: Institution[] = [
  {
    id: "american_express",
    name: "American Express",
    color: "#006FCF",
    initials: "AE",
  },
  {
    id: "capital_one",
    name: "Capital One",
    color: "#FF0000",
    initials: "CO",
  },
  {
    id: "chase",
    name: "Chase",
    color: "#117ACA",
    initials: "CH",
  },
  {
    id: "fidelity",
    name: "Fidelity",
    color: "#00A651",
    initials: "FI",
  },
  {
    id: "wells_fargo",
    name: "Wells Fargo",
    color: "#D71921",
    initials: "WF",
  },
  {
    id: "bank_of_america",
    name: "Bank of America",
    color: "#E31837",
    initials: "BA",
  },
  {
    id: "discover",
    name: "Discover",
    color: "#4B4B4B",
    initials: "DC",
  },
  {
    id: "citibank",
    name: "Citibank",
    color: "#056DAE",
    initials: "CB",
  },
];

// Typography styles
export const TEXT_STYLES = {
  title: {
    fontSize: 22,
    fontWeight: "600" as const,
    color: "#fff",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
};

// Prevent Expo Router from treating this as a route by providing a no-op default export
export default function ModalConstantsPlaceholder() { return null; }
