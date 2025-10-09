// app/_shared/constants/keySynonyms.ts
// Comprehensive synonyms map for 18-35 US users

const KEY_SYNONYMS = {
  // === PROFILE TRAITS ===
  "profile_trait.age": {
    synonyms: ["age", "years old", "turning", "birthday", "young", "old"],
    examples: ["I'm 25", "turning 30", "young professional", "fresh grad"],
  },

  "profile_trait.location": {
    synonyms: [
      "live in",
      "from",
      "based in",
      "located",
      "city",
      "state",
      "moved to",
    ],
    examples: [
      "I live in Austin",
      "from California",
      "based in NYC",
      "moved to Seattle",
    ],
  },

  "profile_trait.occupation": {
    synonyms: [
      "work as",
      "job",
      "career",
      "profession",
      "engineer",
      "teacher",
      "nurse",
      "manager",
      "developer",
      "consultant",
      "freelancer",
      "entrepreneur",
      "ai engineer",
      "data scientist",
      "machine learning",
      "tech lead",
    ],
    examples: [
      "I'm a software engineer",
      "work in marketing",
      "freelance designer",
      "startup founder",
      "ai engineer",
      "data scientist",
    ],
  },

  "profile_trait.education": {
    synonyms: [
      "graduated",
      "degree",
      "college",
      "university",
      "masters",
      "phd",
      "studying",
      "student",
      "dropout",
    ],
    examples: [
      "graduated from UCLA",
      "have a business degree",
      "studying computer science",
      "college dropout",
    ],
  },

  "profile_trait.family.marital_status": {
    synonyms: [
      "married",
      "wife",
      "husband",
      "spouse",
      "partner",
      "single",
      "divorced",
      "widowed",
      "engaged",
      "dating",
      "relationship",
    ],
    examples: [
      "my wife",
      "husband and I",
      "married to",
      "single",
      "in a relationship",
      "my partner",
    ],
  },

  "profile_trait.family.relationship_status": {
    synonyms: [
      "girlfriend",
      "boyfriend",
      "dating",
      "seeing someone",
      "exclusive",
      "casual",
      "long distance",
      "living together",
    ],
    examples: [
      "my girlfriend",
      "dating someone",
      "seeing this person",
      "long distance relationship",
    ],
  },

  "profile_trait.family.children": {
    synonyms: [
      "kids",
      "children",
      "baby",
      "babies",
      "toddler",
      "teenager",
      "son",
      "daughter",
      "parent",
      "mom",
      "dad",
    ],
    examples: [
      "have kids",
      "my son",
      "parent of two",
      "expecting a baby",
      "new mom",
    ],
  },

  "profile_trait.family.living_situation": {
    synonyms: [
      "live with",
      "roommate",
      "roommates",
      "parents",
      "alone",
      "by myself",
      "with friends",
      "renting",
      "owning",
      "apartment",
      "house",
    ],
    examples: [
      "live with my parents",
      "have roommates",
      "live alone",
      "renting an apartment",
      "own my house",
    ],
  },

  // === CONSTRAINTS ===
  "constraint.income.household_type": {
    synonyms: [
      "single income",
      "dual income",
      "unemployed",
      "jobless",
      "between jobs",
      "part time",
      "full time",
      "freelance",
      "gig work",
    ],
    examples: [
      "only I work",
      "both of us work",
      "lost my job",
      "between jobs",
      "part time job",
    ],
  },

  "constraint.income.salary_range": {
    synonyms: [
      "make",
      "earn",
      "salary",
      "income",
      "pay",
      "wage",
      "hourly",
      "annual",
      "six figures",
      "minimum wage",
    ],
    examples: [
      "make $50k",
      "earn six figures",
      "minimum wage job",
      "hourly worker",
      "annual salary",
    ],
  },

  "constraint.debt.student_loans": {
    synonyms: [
      "student loans",
      "student debt",
      "college debt",
      "education loans",
      "federal loans",
      "private loans",
      "paying off loans",
    ],
    examples: [
      "have student loans",
      "student debt",
      "paying off college",
      "federal student loans",
    ],
  },

  "constraint.debt.credit_card": {
    synonyms: [
      "credit card debt",
      "credit cards",
      "high interest",
      "paying minimum",
      "credit score",
      "debt",
    ],
    examples: [
      "credit card debt",
      "high interest debt",
      "paying minimums",
      "bad credit",
    ],
  },

  "constraint.debt.other": {
    synonyms: [
      "car loan",
      "auto loan",
      "mortgage",
      "personal loan",
      "medical debt",
      "hospital bills",
    ],
    examples: ["car payment", "mortgage", "medical bills", "personal loan"],
  },

  "constraint.family_obligation.parents_support": {
    synonyms: [
      "support my parents",
      "help my parents",
      "parents need help",
      "taking care of parents",
      "family support",
      "send money home",
    ],
    examples: [
      "helping my parents",
      "supporting my family",
      "send money home",
      "taking care of parents",
    ],
  },

  "constraint.family_obligation.siblings": {
    synonyms: [
      "help my siblings",
      "support my brother",
      "sister needs help",
      "family member",
      "relative",
    ],
    examples: [
      "helping my brother",
      "supporting my sister",
      "family member needs help",
    ],
  },

  "constraint.health.medical": {
    synonyms: [
      "medical bills",
      "health insurance",
      "doctor visits",
      "prescription",
      "therapy",
      "mental health",
    ],
    examples: [
      "medical expenses",
      "health insurance costs",
      "therapy bills",
      "prescription costs",
    ],
  },

  // === GOALS ===
  // Goal synonyms moved to goals.js

  // === PREFERENCES ===
  "preference.risk_tolerance": {
    synonyms: [
      "risk",
      "conservative",
      "aggressive",
      "safe",
      "risky",
      "cautious",
      "bold",
    ],
    examples: [
      "I'm conservative with money",
      "take risks",
      "play it safe",
      "aggressive investor",
    ],
  },

  "preference.spending.lifestyle": {
    synonyms: [
      "frugal",
      "cheap",
      "splurge",
      "treat myself",
      "budget",
      "save money",
      "spend money",
    ],
    examples: [
      "I'm frugal",
      "like to splurge",
      "budget everything",
      "treat myself",
    ],
  },

  "preference.investment.style": {
    synonyms: [
      "hands on",
      "hands off",
      "set it and forget it",
      "active",
      "passive",
      "diy",
      "robo advisor",
    ],
    examples: [
      "hands on investor",
      "set and forget",
      "diy investing",
      "robo advisor",
    ],
  },

  // === CONTEXT SIGNALS ===
  "context_signal.life_event.job_change": {
    synonyms: [
      "new job",
      "started",
      "got hired",
      "first day",
      "promotion",
      "laid off",
      "fired",
    ],
    examples: [
      "started new job",
      "got promoted",
      "laid off",
      "first day at work",
    ],
  },

  "context_signal.life_event.moving": {
    synonyms: [
      "moved",
      "relocated",
      "new apartment",
      "new house",
      "packing",
      "unpacking",
    ],
    examples: ["just moved", "new apartment", "relocated to", "packing up"],
  },

  "context_signal.life_event.relationship": {
    synonyms: [
      "broke up",
      "got together",
      "moved in",
      "engaged",
      "married",
      "divorced",
    ],
    examples: [
      "broke up with",
      "started dating",
      "moved in together",
      "got engaged",
    ],
  },

  "context_signal.life_event.family": {
    synonyms: [
      "pregnant",
      "had a baby",
      "family member died",
      "parents divorced",
      "sibling got married",
    ],
    examples: [
      "expecting a baby",
      "had a baby",
      "family member passed",
      "parents divorced",
    ],
  },

  "context_signal.financial_stress": {
    synonyms: [
      "stressed",
      "worried",
      "anxious",
      "overwhelmed",
      "drowning",
      "struggling",
      "can't afford",
    ],
    examples: [
      "stressed about money",
      "worried about bills",
      "can't afford",
      "struggling financially",
    ],
  },

  "context_signal.financial_win": {
    synonyms: [
      "got a raise",
      "bonus",
      "tax refund",
      "sold something",
      "inheritance",
      "lottery",
    ],
    examples: ["got a raise", "tax refund", "sold my car", "inherited money"],
  },
};

export default KEY_SYNONYMS;