// api/utils/domainMapper.js

/**
 * Domain mapping system for financial product queries
 * Maps entities to their official websites and search endpoints
 */

// Domain mappings for financial institutions
const DOMAIN_MAPPINGS = {
  // Credit card issuers
  chase: {
    primary: "chase.com",
    creditCards: "chase.com/credit-cards",
    searchPaths: [
      "/credit-cards",
      "/personal/credit-cards",
      "/business/credit-cards",
    ],
  },
  "american express": {
    primary: "americanexpress.com",
    creditCards: "americanexpress.com/us/credit-cards",
    searchPaths: ["/us/credit-cards", "/us/credit-cards/all-cards"],
  },
  amex: {
    primary: "americanexpress.com",
    creditCards: "americanexpress.com/us/credit-cards",
    searchPaths: ["/us/credit-cards", "/us/credit-cards/all-cards"],
  },
  "capital one": {
    primary: "capitalone.com",
    creditCards: "capitalone.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  citi: {
    primary: "citi.com",
    creditCards: "citi.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  "citi bank": {
    primary: "citi.com",
    creditCards: "citi.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  discover: {
    primary: "discover.com",
    creditCards: "discover.com/credit-cards",
    searchPaths: ["/credit-cards", "/credit-cards/all-cards"],
  },
  "wells fargo": {
    primary: "wellsfargo.com",
    creditCards: "wellsfargo.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "bank of america": {
    primary: "bankofamerica.com",
    creditCards: "bankofamerica.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  bofa: {
    primary: "bankofamerica.com",
    creditCards: "bankofamerica.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "us bank": {
    primary: "usbank.com",
    creditCards: "usbank.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  usbank: {
    primary: "usbank.com",
    creditCards: "usbank.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  barclays: {
    primary: "barclaysus.com",
    creditCards: "barclaysus.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  synchrony: {
    primary: "synchrony.com",
    creditCards: "synchrony.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "first national": {
    primary: "fnbo.com",
    creditCards: "fnbo.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  pnc: {
    primary: "pnc.com",
    creditCards: "pnc.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  regions: {
    primary: "regions.com",
    creditCards: "regions.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  huntington: {
    primary: "huntington.com",
    creditCards: "huntington.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  bmo: {
    primary: "bmoharris.com",
    creditCards: "bmoharris.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  hsbc: {
    primary: "us.hsbc.com",
    creditCards: "us.hsbc.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  ally: {
    primary: "ally.com",
    creditCards: "ally.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  sofi: {
    primary: "sofi.com",
    creditCards: "sofi.com/credit-card",
    searchPaths: ["/credit-card", "/personal/credit-card"],
  },
  upgrade: {
    primary: "upgrade.com",
    creditCards: "upgrade.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "credit one": {
    primary: "creditone.com",
    creditCards: "creditone.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  "first premier": {
    primary: "firstpremier.com",
    creditCards: "firstpremier.com/credit-cards",
    searchPaths: ["/credit-cards", "/personal/credit-cards"],
  },
  bilt: {
    primary: "bilt.com",
    creditCards: "bilt.com/credit-card",
    searchPaths: ["/credit-card", "/personal/credit-card"],
  },
  "bilt rewards": {
    primary: "bilt.com",
    creditCards: "bilt.com/credit-card",
    searchPaths: ["/credit-card", "/personal/credit-card"],
  },
  "bilt card": {
    primary: "bilt.com",
    creditCards: "bilt.com/credit-card",
    searchPaths: ["/credit-card", "/personal/credit-card"],
  },

  // Investment platforms
  robinhood: {
    primary: "robinhood.com",
    searchPaths: ["/investing", "/crypto", "/options"],
  },
  fidelity: {
    primary: "fidelity.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  vanguard: {
    primary: "vanguard.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  schwab: {
    primary: "schwab.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  "charles schwab": {
    primary: "schwab.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  etrade: {
    primary: "etrade.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  ameritrade: {
    primary: "tdameritrade.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  "td ameritrade": {
    primary: "tdameritrade.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  "interactive brokers": {
    primary: "interactivebrokers.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  webull: {
    primary: "webull.com",
    searchPaths: ["/investing", "/trading", "/crypto"],
  },
  public: {
    primary: "public.com",
    searchPaths: ["/investing", "/trading", "/crypto"],
  },
  "m1 finance": {
    primary: "m1.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  wealthfront: {
    primary: "wealthfront.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  betterment: {
    primary: "betterment.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  acorns: {
    primary: "acorns.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  stash: {
    primary: "stash.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
  "sofi invest": {
    primary: "sofi.com/invest",
    searchPaths: ["/invest", "/trading", "/retirement"],
  },
  "ally invest": {
    primary: "ally.com/invest",
    searchPaths: ["/invest", "/trading", "/retirement"],
  },
  "merrill edge": {
    primary: "merrilledge.com",
    searchPaths: ["/investing", "/trading", "/retirement"],
  },
};

// Generic financial information sources
const GENERIC_SOURCES = [
  {
    domain: "consumerfinance.gov",
    name: "CFPB",
    searchPaths: ["/data-research", "/consumer-tools", "/ask-cfpb"],
  },
  {
    domain: "nerdwallet.com",
    name: "NerdWallet",
    searchPaths: ["/credit-cards", "/banking", "/investing"],
  },
  {
    domain: "creditkarma.com",
    name: "Credit Karma",
    searchPaths: ["/credit-cards", "/banking", "/investing"],
  },
  {
    domain: "bankrate.com",
    name: "Bankrate",
    searchPaths: ["/credit-cards", "/banking", "/investing"],
  },
  {
    domain: "investopedia.com",
    name: "Investopedia",
    searchPaths: ["/credit-cards", "/banking", "/investing"],
  },
];

/**
 * Get domain mapping for a specific entity
 */
export function getDomainMapping(entity) {
  const lowerEntity = entity.toLowerCase();
  return DOMAIN_MAPPINGS[lowerEntity] || null;
}

/**
 * Get all relevant domains for a set of entities
 */
export function getRelevantDomains(entities) {
  const domains = new Set();

  // Add specific entity domains
  for (const entity of entities.rawEntities) {
    const mapping = getDomainMapping(entity);
    if (mapping) {
      domains.add(mapping.primary);
    }
  }

  // Add generic sources if no specific domains found
  if (domains.size === 0) {
    GENERIC_SOURCES.forEach((source) => domains.add(source.domain));
  }

  return Array.from(domains);
}

/**
 * Build search URLs for a domain and entity
 */
export function buildSearchUrls(domain, entity, searchPaths = []) {
  const urls = [];

  // Get domain mapping
  const mapping = getDomainMapping(entity);
  if (mapping) {
    // Use specific search paths from mapping
    mapping.searchPaths.forEach((path) => {
      urls.push(`https://${mapping.primary}${path}`);
    });
  } else {
    // Use generic search paths
    searchPaths.forEach((path) => {
      urls.push(`https://${domain}${path}`);
    });
  }

  // Add generic search paths if no specific ones
  if (urls.length === 0) {
    urls.push(`https://${domain}`);
  }

  return urls;
}

/**
 * Get search strategy for a query
 */
export function getSearchStrategy(entities, message) {
  const lowerMessage = message.toLowerCase();

  // Determine if this is a comparison query
  const isComparison =
    entities.comparisonWords.length > 0 ||
    lowerMessage.includes("vs") ||
    lowerMessage.includes("compare");

  // Get relevant domains
  const domains = getRelevantDomains(entities);

  // Build search URLs for each domain
  const searchUrls = [];
  for (const domain of domains) {
    const urls = buildSearchUrls(domain, entities.rawEntities[0] || "", []);
    searchUrls.push(...urls);
  }

  return {
    isComparison,
    domains,
    searchUrls,
    strategy: isComparison ? "comparison" : "product_info",
  };
}

/**
 * Get fallback domains when specific searches fail
 */
export function getFallbackDomains() {
  return GENERIC_SOURCES.map((source) => source.domain);
}
