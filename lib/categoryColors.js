/**
 * Category color mapping - single source of truth for category colors.
 * Used when creating categories (Finny budget, manual) and as fallback in useCategories.
 *
 * - Known category names use fixed colors from the map.
 * - "Other" always uses #607D8B.
 * - Unknown categories get a random but consistent color (derived from name hash).
 */

const CATEGORY_COLOR_MAP = {
  Groceries: "#4CAF50",
  Food: "#FF6B6B",
  "Dining Out": "#FF6B6B",
  Housing: "#8E44AD",
  Rent: "#8E44AD",
  Transportation: "#45B7D1",
  Shopping: "#4ECDC4",
  Entertainment: "#96CEB4",
  Subscriptions: "#9C27B0",
  "Health & Fitness": "#2E7D32",
  Health: "#2E7D32",
  "Bills & Utilities": "#FF9800",
  "Personal Care": "#E91E63",
  Travel: "#2196F3",
  Education: "#795548",
  "Savings & Investments": "#27AE60",
  Savings: "#27AE60",
  Income: "#1B5E20",
  Other: "#607D8B",
  Loans: "#9C27B0",
  Investing: "#27AE60",
  Phone: "#9C27B0",
  Business: "#1565C0",
  Booze: "#E91E63",
  INTERNAL_TRANSFER: "#78909C",
};

const FALLBACK_COLOR = "#607D8B";

/**
 * Generate a consistent random color from a string (e.g. category name).
 * Same string always produces the same color.
 */
function hashToColor(str) {
  let hash = 0;
  const s = String(str || "unknown").trim();
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  // Use golden ratio for better distribution
  const hue = Math.abs(((hash * 0.618033988749895) % 1) * 360);
  const saturation = 55 + (Math.abs(hash) % 25);
  const lightness = 40 + (Math.abs(hash >> 8) % 20);
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (n) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Get color for a category name.
 * - "Other" → #607D8B
 * - Known names → fixed color from map
 * - Unknown names → consistent random color from name hash
 */
function getColorForCategoryName(categoryName) {
  if (!categoryName || typeof categoryName !== "string") {
    return FALLBACK_COLOR;
  }
  const trimmed = categoryName.trim();
  if (!trimmed) return FALLBACK_COLOR;
  if (trimmed === "Other") return FALLBACK_COLOR;
  const fromMap = CATEGORY_COLOR_MAP[trimmed];
  if (fromMap) return fromMap;
  return hashToColor(trimmed);
}

export { CATEGORY_COLOR_MAP, getColorForCategoryName };
