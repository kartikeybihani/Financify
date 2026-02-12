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
// Only includes institutions that have Plaid support
export const CASH_DEPOSIT_INSTITUTIONS: Institution[] = [
  {
    id: "chase",
    name: "Chase",
    color: "#117ACA",
    initials: "CH",
  },
  {
    id: "bank_of_america",
    name: "Bank of America",
    color: "#E31837",
    initials: "BA",
  },
  {
    id: "wells_fargo",
    name: "Wells Fargo",
    color: "#D71921",
    initials: "WF",
  },
  {
    id: "capital_one",
    name: "Capital One",
    color: "#FF0000",
    initials: "CO",
  },
  {
    id: "american_express",
    name: "American Express",
    color: "#006FCF",
    initials: "AE",
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
    id: "citibank",
    name: "Citibank",
    color: "#056DAE",
    initials: "CB",
  },
  // Note: Venmo, US Bank, and Fidelity are not available through Plaid
  // Users can still connect them through "Other Institutions" option
];

// Mapping of institution IDs to Plaid institution IDs
// These are the actual Plaid institution IDs that can be used with linkTokenCreate
// Updated with verified institution IDs (as of 2024)
export const PLAID_INSTITUTION_ID_MAP: Record<string, string> = {
  chase: "ins_56",
  bank_of_america: "ins_100866", 
  wells_fargo: "ins_127991",
  capital_one: "ins_128026",
  american_express: "ins_10",
  chime: "ins_35",
  discover: "ins_33",
  citibank: "ins_5",
  // Note: Some institutions may require OAuth registration in Plaid Dashboard
  // If you continue to get "invalid institution_id" errors, check:
  // 1. Institution is registered in your Plaid Dashboard
  // 2. Institution supports the products you're requesting
  // 3. Institution IDs haven't changed (verify via /institutions/get endpoint)
};

// Helper function to get Plaid institution ID
export const getPlaidInstitutionId = (institutionId: string): string | null => {
  return PLAID_INSTITUTION_ID_MAP[institutionId] || null;
};

// Reverse map: Plaid ins_* ID -> internal ID (for logo lookup in INSTITUTION_LOGO_MAP)
const PLAID_TO_INTERNAL_ID_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PLAID_INSTITUTION_ID_MAP).map(([internal, plaid]) => [plaid, internal])
);

/** Resolve to internal ID for logo lookup. Handles both Plaid (ins_*) and internal IDs. */
export const getLogoInstitutionId = (institutionId: string): string => {
  if (!institutionId) return institutionId;
  return PLAID_TO_INTERNAL_ID_MAP[institutionId] ?? institutionId;
};

// Helper function to validate institution ID format
export const isValidInstitutionId = (institutionId: string): boolean => {
  return institutionId.startsWith('ins_') && institutionId.length > 4;
};

// Debug helper to log institution mapping for troubleshooting
export const logInstitutionMapping = () => {
  console.log('🏦 Current Plaid Institution ID Mapping:');
  Object.entries(PLAID_INSTITUTION_ID_MAP).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
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
    fontFamily: "Manrope",
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

// Curated set of icons for category selection - all emojis
export interface CuratedIcon {
  type: "emoji";
  value: string;
  name: string;
}

export const CURATED_ICONS: CuratedIcon[] = [
  // Financial & Money
  { type: "emoji", value: "💰", name: "Money" },
  { type: "emoji", value: "💵", name: "Dollar" },
  { type: "emoji", value: "💴", name: "Yen" },
  { type: "emoji", value: "💶", name: "Euro" },
  { type: "emoji", value: "💷", name: "Pound" },
  { type: "emoji", value: "💳", name: "Credit Card" },
  { type: "emoji", value: "💎", name: "Savings" },
  { type: "emoji", value: "🏦", name: "Bank" },
  { type: "emoji", value: "📊", name: "Investment" },
  { type: "emoji", value: "📈", name: "Stocks" },
  
  // Shopping & Retail
  { type: "emoji", value: "🛒", name: "Shopping" },
  { type: "emoji", value: "🛍️", name: "Store" },
  { type: "emoji", value: "👜", name: "Bag" },
  { type: "emoji", value: "👕", name: "Clothing" },
  { type: "emoji", value: "👟", name: "Shoes" },
  { type: "emoji", value: "👔", name: "Tie" },
  
  // Food & Dining
  { type: "emoji", value: "🍽️", name: "Food" },
  { type: "emoji", value: "🍕", name: "Pizza" },
  { type: "emoji", value: "🍔", name: "Fast Food" },
  { type: "emoji", value: "🍟", name: "Fries" },
  { type: "emoji", value: "🌮", name: "Taco" },
  { type: "emoji", value: "🍜", name: "Noodles" },
  { type: "emoji", value: "🍱", name: "Bento" },
  { type: "emoji", value: "🍣", name: "Sushi" },
  { type: "emoji", value: "🥗", name: "Salad" },
  { type: "emoji", value: "☕", name: "Cafe" },
  { type: "emoji", value: "🍺", name: "Beer" },
  { type: "emoji", value: "🍷", name: "Wine" },
  { type: "emoji", value: "🥂", name: "Cheers" },
  { type: "emoji", value: "🍰", name: "Dessert" },
  { type: "emoji", value: "🍪", name: "Cookie" },
  { type: "emoji", value: "🍩", name: "Donut" },
  { type: "emoji", value: "🧋", name: "Bubble Tea" },
  
  // Home & Living
  { type: "emoji", value: "🏠", name: "Home" },
  { type: "emoji", value: "🏡", name: "House" },
  { type: "emoji", value: "🛋️", name: "Furniture" },
  { type: "emoji", value: "🛏️", name: "Bed" },
  { type: "emoji", value: "🪑", name: "Chair" },
  { type: "emoji", value: "🪔", name: "Lamp" },
  { type: "emoji", value: "🔧", name: "Tools" },
  { type: "emoji", value: "🧹", name: "Cleaning" },
  { type: "emoji", value: "🌱", name: "Plants" },
  
  // Transportation
  { type: "emoji", value: "🚗", name: "Car" },
  { type: "emoji", value: "🚙", name: "SUV" },
  { type: "emoji", value: "🚕", name: "Taxi" },
  { type: "emoji", value: "🚌", name: "Bus" },
  { type: "emoji", value: "🚂", name: "Train" },
  { type: "emoji", value: "✈️", name: "Travel" },
  { type: "emoji", value: "🚢", name: "Ship" },
  { type: "emoji", value: "🚲", name: "Bike" },
  { type: "emoji", value: "🛴", name: "Scooter" },
  { type: "emoji", value: "⛽", name: "Gas" },
  { type: "emoji", value: "🅿️", name: "Parking" },
  
  // Entertainment & Media
  { type: "emoji", value: "🎬", name: "Entertainment" },
  { type: "emoji", value: "🎮", name: "Gaming" },
  { type: "emoji", value: "🎵", name: "Music" },
  { type: "emoji", value: "🎧", name: "Headphones" },
  { type: "emoji", value: "🎤", name: "Karaoke" },
  { type: "emoji", value: "🎭", name: "Theater" },
  { type: "emoji", value: "🎪", name: "Circus" },
  { type: "emoji", value: "🎨", name: "Art" },
  { type: "emoji", value: "🎯", name: "Darts" },
  { type: "emoji", value: "🎲", name: "Games" },
  { type: "emoji", value: "📺", name: "TV" },
  { type: "emoji", value: "🎥", name: "Camera" },
  { type: "emoji", value: "📷", name: "Photo" },
  { type: "emoji", value: "📱", name: "Phone" },
  { type: "emoji", value: "💻", name: "Computer" },
  { type: "emoji", value: "📚", name: "Education" },
  { type: "emoji", value: "📖", name: "Book" },
  { type: "emoji", value: "✏️", name: "School" },
  { type: "emoji", value: "🎓", name: "Graduation" },
  
  // Health & Fitness
  { type: "emoji", value: "🏥", name: "Health" },
  { type: "emoji", value: "💊", name: "Medicine" },
  { type: "emoji", value: "🩺", name: "Doctor" },
  { type: "emoji", value: "💉", name: "Vaccine" },
  { type: "emoji", value: "🏋️", name: "Gym" },
  { type: "emoji", value: "💪", name: "Fitness" },
  { type: "emoji", value: "🧘", name: "Yoga" },
  { type: "emoji", value: "🏃", name: "Running" },
  { type: "emoji", value: "🚴", name: "Cycling" },
  { type: "emoji", value: "🏊", name: "Swimming" },
  { type: "emoji", value: "⚽", name: "Sports" },
  { type: "emoji", value: "🏀", name: "Basketball" },
  { type: "emoji", value: "🎾", name: "Tennis" },
  { type: "emoji", value: "🏸", name: "Badminton" },
  { type: "emoji", value: "🧴", name: "Personal Care" },
  { type: "emoji", value: "✨", name: "Beauty" },
  { type: "emoji", value: "💅", name: "Nails" },
  { type: "emoji", value: "💇", name: "Haircut" },
  { type: "emoji", value: "💄", name: "Cosmetics" },
  
  // Utilities & Services
  { type: "emoji", value: "⚡", name: "Utilities" },
  { type: "emoji", value: "🔌", name: "Electricity" },
  { type: "emoji", value: "💧", name: "Water" },
  { type: "emoji", value: "🔥", name: "Gas" },
  { type: "emoji", value: "📡", name: "Internet" },
  { type: "emoji", value: "📞", name: "Phone Bill" },
  { type: "emoji", value: "🗑️", name: "Trash" },
  { type: "emoji", value: "📦", name: "Package" },
  { type: "emoji", value: "🚚", name: "Delivery" },
  { type: "emoji", value: "🔨", name: "Repair" },
  { type: "emoji", value: "🛠️", name: "Maintenance" },
  
  // Lifestyle & Personal
  { type: "emoji", value: "🌿", name: "Nature" },
  { type: "emoji", value: "🌳", name: "Tree" },
  { type: "emoji", value: "🌺", name: "Flowers" },
  { type: "emoji", value: "🐕", name: "Pet" },
  { type: "emoji", value: "🐈", name: "Cat" },
  { type: "emoji", value: "🐦", name: "Bird" },
  { type: "emoji", value: "🎁", name: "Gift" },
  { type: "emoji", value: "🎉", name: "Party" },
  { type: "emoji", value: "🎊", name: "Celebration" },
  { type: "emoji", value: "💐", name: "Bouquet" },
  { type: "emoji", value: "🌹", name: "Rose" },
  { type: "emoji", value: "💍", name: "Jewelry" },
  { type: "emoji", value: "👗", name: "Fashion" },
  { type: "emoji", value: "🧥", name: "Jacket" },
  { type: "emoji", value: "👓", name: "Glasses" },
  { type: "emoji", value: "⌚", name: "Watch" },
  { type: "emoji", value: "🎒", name: "Backpack" },
  { type: "emoji", value: "🧳", name: "Luggage" },
  { type: "emoji", value: "🕶️", name: "Sunglasses" },
  
  // Travel & Vacation
  { type: "emoji", value: "🏖️", name: "Beach" },
  { type: "emoji", value: "🏔️", name: "Mountain" },
  { type: "emoji", value: "⛺", name: "Camping" },
  { type: "emoji", value: "🏨", name: "Hotel" },
  { type: "emoji", value: "🛫", name: "Flight" },
  { type: "emoji", value: "🗺️", name: "Map" },
  { type: "emoji", value: "🧭", name: "Compass" },
  { type: "emoji", value: "🎫", name: "Ticket" },
  { type: "emoji", value: "🎟️", name: "Admission" },
  
  // Miscellaneous
  { type: "emoji", value: "💌", name: "Mail" },
  { type: "emoji", value: "📧", name: "Email" },
  { type: "emoji", value: "📝", name: "Notes" },
  { type: "emoji", value: "📋", name: "Clipboard" },
  { type: "emoji", value: "🔑", name: "Keys" },
  { type: "emoji", value: "🚪", name: "Door" },
  { type: "emoji", value: "🪟", name: "Window" },
  { type: "emoji", value: "🛡️", name: "Insurance" },
  { type: "emoji", value: "⚖️", name: "Legal" },
  { type: "emoji", value: "📜", name: "Document" },
  { type: "emoji", value: "🏛️", name: "Government" },
  { type: "emoji", value: "⛪", name: "Church" },
  { type: "emoji", value: "🕌", name: "Mosque" },
  { type: "emoji", value: "🕍", name: "Synagogue" },
  { type: "emoji", value: "🙏", name: "Charity" },
  { type: "emoji", value: "🤝", name: "Donation" },
];

// Prevent Expo Router from treating this as a route by providing a no-op default export
export default function ModalConstantsPlaceholder() { return null; }
