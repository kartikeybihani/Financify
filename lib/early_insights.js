// Shared onboarding "early insights" logic.
// IMPORTANT: This file intentionally mirrors the logic + prompt behavior in `tests/basic.js`.

import { buildOnboardingEarlyInsightsPrompt } from "./prompt_engine.js";

export const extractFirstJsonObjectFromText = (text) => {
  const s = String(text || "");

  // Prefer fenced blocks: ```json ... ``` or ``` ... ``` anywhere in the string.
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }

  // Fallback: first {...} span.
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      // ignore
    }
  }

  return null;
};

export const formatDate = (d) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const getDateRangeLast6Months = () => {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(end.getMonth() - 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

export const getLast6MonthKeys = () => {
  const end = new Date();
  return Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(end);
    d.setMonth(end.getMonth() - i);
    return formatDate(d).slice(0, 7);
  });
};

export const isLikelyInternalOrPayment = (tx) => {
  if (tx.new_category === "INTERNAL_TRANSFER") return true;

  const name = String(tx.name || "").toUpperCase();
  const merchant = String(tx.merchant_name || "").toUpperCase();

  if (
    name.startsWith("AUTOMATIC PAYMENT") ||
    name.includes("AUTOMATIC PAYMENT -") ||
    merchant.startsWith("AUTOMATIC PAYMENT")
  ) {
    return true;
  }

  if (
    (name.includes("CREDIT CARD") && name.includes("PAYMENT")) ||
    (name.includes("PAYMENT") &&
      name.includes("CREDIT CARD") &&
      /\d{4}/.test(name))
  ) {
    return true;
  }

  if (
    name.includes("PAYMENT") &&
    (name.includes("ACH") || (name.includes("BILL") && name.includes("PAYMENT")))
  ) {
    return true;
  }

  return false;
};

const normalizeMerchant = (tx) => {
  const raw = String(tx.merchant_name || tx.name || "").trim();
  if (!raw) return "UNKNOWN";

  const upper = raw.toUpperCase();
  return upper
    .replace(/\s+/g, " ")
    .replace(/[|•·]/g, " ")
    .replace(/[#*]/g, " ")
    .replace(/\b(ONLINE|WEB|MOBILE|APP)\b/g, " ")
    .replace(/\b(US|USA)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getEffectiveCategory = (tx) => {
  const c = String(tx.new_category || tx.top_category || "Other").trim();
  return c || "Other";
};

const getMonthKey = (dateStr) => String(dateStr).slice(0, 7);

const getDayOfWeek = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.getUTCDay();
};

const getDayOfMonth = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.getUTCDate();
};

const getIsoDayName = (dow) => {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return dayNames[dow] || "Unknown";
};

const isWeekend = (dow) => dow === 0 || dow === 6;

const toNumber = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

const safeDiv = (a, b) => (b ? a / b : 0);

const median = (nums) => {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
};

const mean = (nums) => {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

const stddev = (nums) => {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = mean(nums.map((n) => (n - m) * (n - m)));
  return Math.sqrt(v);
};

const clamp01 = (n) => Math.max(0, Math.min(1, n));

const classifyTransactionKind = (tx) => {
  // Prefer transaction_type when present, fallback to amount sign.
  const t = String(tx.transaction_type || "").toLowerCase();
  if (t) {
    if (t.includes("debit")) return "expense";
    if (t.includes("credit")) return "income";
  }
  const amt = toNumber(tx.amount);
  if (amt > 0) return "expense";
  if (amt < 0) return "income";
  return "unknown";
};

const normalizeTx = (tx) => {
  const date = String(tx.date);
  const dow = getDayOfWeek(date);
  const dom = getDayOfMonth(date);
  return {
    raw: tx,
    date,
    month: getMonthKey(date),
    dayOfWeek: dow,
    dayName: getIsoDayName(dow),
    isWeekend: isWeekend(dow),
    dayOfMonth: dom,
    merchant: normalizeMerchant(tx),
    category: getEffectiveCategory(tx),
    amount: toNumber(tx.amount),
    kind: classifyTransactionKind(tx),
    pending: !!tx.pending,
  };
};

export const computePatterns = ({ transactions, months }) => {
  // Keep this deterministic + debuggable. Filter hard to avoid junk.
  const normalized = transactions.map(normalizeTx);
  const txs = normalized.filter((t) => !t.pending && t.kind === "expense" && t.amount > 0);
  const monthSet = new Set(months);
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  let totalExpense = 0;
  const expenseByCategory = new Map();
  const expenseByMerchant = new Map();

  const merchantMonthlyCount = new Map();
  const merchantMonthlyAmounts = new Map();
  const categoryDowMonthlyCount = new Map();

  // For deeper patterns
  const merchantContextMonthlyCount = new Map(); // key = merchant|dow|bucket|month
  const merchantClusterMonthlySpend = new Map(); // clusterKey -> number[6]
  const merchantClusterMembers = new Map(); // clusterKey -> Set(merchant)

  // Month buckets for behavior change comparisons.
  const earlyMonths = new Set(months.slice(3));
  const recentMonths = new Set(months.slice(0, 3));

  // Aggregations used across patterns.
  const expenseByMonth = Array(months.length).fill(0);
  const expenseByMonthWeekend = Array(months.length).fill(0);
  const expenseByMonthWeekday = Array(months.length).fill(0);

  const categoryMonthlyExpense = new Map(); // category -> number[6]
  const merchantMonthlyExpense = new Map(); // merchant -> number[6]

  const categoryWeekendWeekday = new Map(); // category -> {weekend, weekday}
  const dayOfMonthHistogram = Array(31).fill(0);

  for (const tx of txs) {
    const month = tx.month;
    if (!monthSet.has(month)) continue;

    const amount = tx.amount;
    totalExpense += amount;

    const category = tx.category;
    expenseByCategory.set(category, (expenseByCategory.get(category) || 0) + amount);

    const catMonthly = categoryMonthlyExpense.get(category) || Array(months.length).fill(0);
    const idxCat = monthIndex.get(month);
    if (idxCat !== undefined) catMonthly[idxCat] += amount;
    categoryMonthlyExpense.set(category, catMonthly);

    const merchant = tx.merchant;
    expenseByMerchant.set(merchant, (expenseByMerchant.get(merchant) || 0) + amount);

    const merchMonthly = merchantMonthlyExpense.get(merchant) || Array(months.length).fill(0);
    const idxMerch = monthIndex.get(month);
    if (idxMerch !== undefined) merchMonthly[idxMerch] += amount;
    merchantMonthlyExpense.set(merchant, merchMonthly);

    const idxMonth = monthIndex.get(month);
    if (idxMonth !== undefined) {
      expenseByMonth[idxMonth] += amount;
      if (tx.isWeekend) expenseByMonthWeekend[idxMonth] += amount;
      else expenseByMonthWeekday[idxMonth] += amount;
    }

    const ww = categoryWeekendWeekday.get(category) || { weekend: 0, weekday: 0 };
    if (tx.isWeekend) ww.weekend += amount;
    else ww.weekday += amount;
    categoryWeekendWeekday.set(category, ww);

    if (tx.dayOfMonth >= 1 && tx.dayOfMonth <= 31) {
      dayOfMonthHistogram[tx.dayOfMonth - 1] += 1;
    }

    // Contextual routine: merchant + day-of-week + time-of-month bucket
    const bucket = tx.dayOfMonth <= 10 ? "early" : tx.dayOfMonth <= 20 ? "mid" : "late";
    const ctxKey = `${merchant}|${tx.dayOfWeek}|${bucket}|${month}`;
    merchantContextMonthlyCount.set(
      ctxKey,
      (merchantContextMonthlyCount.get(ctxKey) || 0) + 1
    );

    // Merchant clustering: simple deterministic grouping.
    // Goal: merge variants like "UBER *TRIP" / "UBER TRIP" / "UBER".
    const clusterKey = merchant
      .replace(/\d+/g, " ")
      .replace(/\b(INC|LLC|CO|CORP|LTD|THE)\b/g, " ")
      .replace(/\b(POS|DBT|DEBIT|CREDIT)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ");

    const cm = merchantClusterMembers.get(clusterKey) || new Set();
    cm.add(merchant);
    merchantClusterMembers.set(clusterKey, cm);

    const cs = merchantClusterMonthlySpend.get(clusterKey) ||
      Array(months.length).fill(0);
    if (idxMonth !== undefined) cs[idxMonth] += amount;
    merchantClusterMonthlySpend.set(clusterKey, cs);

    const mmKey = `${merchant}|${month}`;
    merchantMonthlyCount.set(mmKey, (merchantMonthlyCount.get(mmKey) || 0) + 1);
    const amtArr = merchantMonthlyAmounts.get(mmKey) || [];
    amtArr.push(amount);
    merchantMonthlyAmounts.set(mmKey, amtArr);

    const dow = tx.dayOfWeek;
    const cdKey = `${category}|${dow}|${month}`;
    categoryDowMonthlyCount.set(cdKey, (categoryDowMonthlyCount.get(cdKey) || 0) + 1);
  }

  const patterns = [];

  const diagnostics = {
    merchantClusters: { candidates: 0, surfaced: 0 },
    contextualRoutines: { candidates: 0, surfaced: 0 },
    volatility: { cv: null, surfaced: 0 },
    lateMonthShift: { delta: null, surfaced: 0 },
  };

  // A) Spend concentration (category)
  if (totalExpense > 0) {
    const topCats = [...expenseByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
        share: amount / totalExpense,
      }));

    if (topCats[0] && topCats[0].share >= 0.35) {
      const c = topCats[0];
      patterns.push({
        type: "spend_concentration",
        key: `category:${c.category}`,
        confidence: clamp01((c.share - 0.35) / 0.25 + 0.65),
        title: `Most of your spending clusters in ${c.category}`,
        description: `${Math.round(c.share * 100)}% of your last 6 months of expenses fall into ${c.category}.`,
        evidence: { topCategories: topCats, totalExpense },
      });
    }
  }

  // B) Merchant stickiness (habit merchants)
  const merchantStats = new Map();
  for (const [mmKey, count] of merchantMonthlyCount.entries()) {
    const splitAt = mmKey.lastIndexOf("|");
    const merchant = mmKey.slice(0, splitAt);
    const month = mmKey.slice(splitAt + 1);

    const stat = merchantStats.get(merchant) || {
      merchant,
      monthsPresent: new Set(),
      totalCount: 0,
      monthlyCounts: Array(months.length).fill(0),
      medianAmountsByMonth: [],
    };
    stat.monthsPresent.add(month);
    stat.totalCount += count;
    const idx = monthIndex.get(month);
    if (idx !== undefined) stat.monthlyCounts[idx] = count;
    const amts = merchantMonthlyAmounts.get(mmKey) || [];
    stat.medianAmountsByMonth.push(median(amts));
    merchantStats.set(merchant, stat);
  }

  const habitMerchants = [...merchantStats.values()]
    .filter((s) => s.monthsPresent.size >= 4)
    .map((s) => {
      const monthsPresent = s.monthsPresent.size;
      const avgPerMonth = s.totalCount / months.length;
      const recent2 = s.monthlyCounts.slice(0, 2).reduce((a, b) => a + b, 0);
      const older4 = s.monthlyCounts.slice(2).reduce((a, b) => a + b, 0);
      const trend = older4 > 0 ? recent2 / (older4 / 2) : null;
      const conf = clamp01(0.35 + monthsPresent / 10 + Math.min(0.35, avgPerMonth / 8));
      return {
        ...s,
        monthsPresent,
        avgPerMonth,
        trend,
        confidence: conf,
      };
    })
    .filter((s) => s.avgPerMonth >= 2)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);

  for (const m of habitMerchants.slice(0, 3)) {
    patterns.push({
      type: "merchant_stickiness",
      key: `merchant:${m.merchant}`,
      confidence: m.confidence,
      title: `You keep coming back to ${m.merchant}`,
      description: `You had transactions at ${m.merchant} in ${m.monthsPresent}/6 months (avg ${m.avgPerMonth.toFixed(1)}/month).`,
      evidence: {
        months,
        monthsPresent: m.monthsPresent,
        monthlyCounts: m.monthlyCounts,
        totalCount: m.totalCount,
        medianTxnAmount: median(
          m.medianAmountsByMonth.filter((x) => typeof x === "number")
        ),
        trendVsOlderMonths: m.trend,
      },
    });
  }

  // B2) Merchant monthly spikes ("Uber in X/Y/Z months way above your typical")
  // Use spend (not count) because it's more meaningful for behavior.
  const merchantSpikes = [...merchantMonthlyExpense.entries()]
    .map(([merchant, monthly]) => {
      const avg = monthly.reduce((a, b) => a + b, 0) / months.length;
      const max = Math.max(...monthly);
      const maxIdx = monthly.indexOf(max);
      const maxMonth = months[maxIdx];
      const ratio = avg > 0 ? max / avg : null;
      return { merchant, monthly, avg, max, maxMonth, ratio };
    })
    .filter((m) => m.avg >= 80 && m.ratio !== null && m.ratio >= 1.9)
    .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))
    .slice(0, 6);

  for (const s of merchantSpikes.slice(0, 3)) {
    patterns.push({
      type: "behavior_merchant_spike",
      key: `merchant_spike:${s.merchant}`,
      confidence: clamp01(0.55 + Math.min(0.4, (s.ratio - 1.9) / 2.6)),
      title: `${s.merchant} spiked in ${s.maxMonth}`,
      description: `In ${s.maxMonth} you spent $${s.max.toFixed(0)} at ${s.merchant} vs your typical ~$${s.avg.toFixed(0)}/month (${s.ratio.toFixed(1)}×).`,
      evidence: {
        months,
        monthlySpend: s.monthly,
        avgMonthlySpend: s.avg,
        spikeMonth: s.maxMonth,
        spikeSpend: s.max,
        spikeVsAverage: s.ratio,
      },
    });
  }

  // C) Routine by day-of-week (category + dow)
  const dowStats = new Map();
  for (const [key, count] of categoryDowMonthlyCount.entries()) {
    const [category, dow, month] = key.split("|");
    const statKey = `${category}|${dow}`;
    const stat = dowStats.get(statKey) || {
      category,
      dow: Number(dow),
      monthsPresent: new Set(),
      totalCount: 0,
      monthlyCounts: Array(months.length).fill(0),
    };
    stat.monthsPresent.add(month);
    stat.totalCount += count;
    const idx = monthIndex.get(month);
    if (idx !== undefined) stat.monthlyCounts[idx] = count;
    dowStats.set(statKey, stat);
  }

  const routines = [...dowStats.values()]
    .filter((s) => s.monthsPresent.size >= 4)
    .map((s) => {
      const monthsPresent = s.monthsPresent.size;
      const avgPerMonth = s.totalCount / months.length;
      const conf = clamp01(0.3 + monthsPresent / 10 + Math.min(0.4, avgPerMonth / 10));
      return { ...s, monthsPresent, avgPerMonth, confidence: conf };
    })
    .filter((s) => s.avgPerMonth >= 3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  for (const r of routines) {
    patterns.push({
      type: "routine_day_of_week",
      key: `routine:${r.category}:${r.dow}`,
      confidence: r.confidence,
      title: `${r.category} tends to show up on ${getIsoDayName(r.dow)}`,
      description: `This category appears in ${r.monthsPresent}/6 months and averages ${r.avgPerMonth.toFixed(1)} transactions/month on ${getIsoDayName(r.dow)}.`,
      evidence: {
        category: r.category,
        dayOfWeek: r.dow,
        dayName: getIsoDayName(r.dow),
        monthlyCounts: r.monthlyCounts,
      },
    });
  }

  // D) Identity routine: weekend-vs-weekday category identity
  const weekendIdentity = [...categoryWeekendWeekday.entries()]
    .map(([category, ww]) => {
      const total = ww.weekend + ww.weekday;
      const shareWeekend = total > 0 ? ww.weekend / total : 0;
      return {
        category,
        total,
        shareWeekend,
        weekend: ww.weekend,
        weekday: ww.weekday,
      };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const strongestWeekend = weekendIdentity
    .filter((x) => x.shareWeekend >= 0.7 && x.total >= totalExpense * 0.06)
    .slice(0, 2);
  for (const w of strongestWeekend) {
    patterns.push({
      type: "identity_weekend_category",
      key: `weekend:${w.category}`,
      confidence: clamp01(0.55 + (w.shareWeekend - 0.7) / 0.3),
      title: `${w.category} is mostly a weekend thing for you`,
      description: `${Math.round(w.shareWeekend * 100)}% of your ${w.category} spend happens on weekends.`,
      evidence: {
        weekendSpend: w.weekend,
        weekdaySpend: w.weekday,
        shareWeekend: w.shareWeekend,
      },
    });
  }

  // E) Behavior change: category spend drift (recent 3 months vs prior 3)
  const categoryDrift = [...categoryMonthlyExpense.entries()]
    .map(([category, monthly]) => {
      const recent = monthly.slice(0, 3).reduce((a, b) => a + b, 0);
      const prior = monthly.slice(3).reduce((a, b) => a + b, 0);
      const recentAvg = recent / 3;
      const priorAvg = prior / 3;
      const delta = recentAvg - priorAvg;
      const pct = priorAvg > 0 ? delta / priorAvg : null;
      return {
        category,
        monthly,
        recentAvg,
        priorAvg,
        delta,
        pct,
        total: recent + prior,
      };
    })
    .filter((x) => x.total >= totalExpense * 0.05)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  for (const d of categoryDrift.slice(0, 3)) {
    // Only surface meaningful drift.
    const meaningful = Math.abs(d.delta) >= 40 || (d.pct !== null && Math.abs(d.pct) >= 0.35);
    if (!meaningful) continue;
    const direction = d.delta > 0 ? "up" : "down";
    const conf = clamp01(
      0.45 +
        Math.min(0.35, Math.abs(d.delta) / 300) +
        (d.pct !== null ? Math.min(0.2, Math.abs(d.pct) / 1.2) : 0)
    );
    patterns.push({
      type: "behavior_category_drift",
      key: `drift:${d.category}`,
      confidence: conf,
      title: `${d.category} spending is trending ${direction}`,
      description: `Your monthly average for ${d.category} moved from $${d.priorAvg.toFixed(0)} to $${d.recentAvg.toFixed(0)} (${direction} $${Math.abs(d.delta).toFixed(0)}).`,
      evidence: {
        months,
        monthlySpend: d.monthly,
        prior3MonthAvg: d.priorAvg,
        recent3MonthAvg: d.recentAvg,
        delta: d.delta,
        pctChange: d.pct,
      },
    });
  }

  // F) Behavior change: weekend share shifting (recent vs prior)
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const recentWeekend = sum(expenseByMonthWeekend.slice(0, 3));
  const recentTotal = sum(expenseByMonth.slice(0, 3));
  const priorWeekend = sum(expenseByMonthWeekend.slice(3));
  const priorTotal = sum(expenseByMonth.slice(3));
  const recentShare = safeDiv(recentWeekend, recentTotal);
  const priorShare = safeDiv(priorWeekend, priorTotal);
  const shareDelta = recentShare - priorShare;
  if (Math.abs(shareDelta) >= 0.12 && recentTotal > 0 && priorTotal > 0) {
    patterns.push({
      type: "behavior_weekend_shift",
      key: "weekend_shift",
      confidence: clamp01(0.55 + Math.abs(shareDelta) / 0.35),
      title: shareDelta > 0 ? "Weekends got more expensive" : "Weekends got calmer",
      description: `Weekend share moved from ${Math.round(priorShare * 100)}% to ${Math.round(recentShare * 100)}% (Δ ${Math.round(shareDelta * 100)} pts).`,
      evidence: {
        months,
        priorWeekendShare: priorShare,
        recentWeekendShare: recentShare,
        delta: shareDelta,
        prior3MonthTotals: { weekend: priorWeekend, total: priorTotal },
        recent3MonthTotals: { weekend: recentWeekend, total: recentTotal },
      },
    });
  }

  // G) Identity routine: end-of-month clustering (days 25-31)
  const endOfMonthCount = dayOfMonthHistogram
    .slice(24)
    .reduce((a, b) => a + b, 0);
  const totalCount = dayOfMonthHistogram.reduce((a, b) => a + b, 0);
  const endShare = safeDiv(endOfMonthCount, totalCount);
  if (totalCount >= 60 && endShare >= 0.38) {
    patterns.push({
      type: "identity_end_of_month_cluster",
      key: "end_of_month_cluster",
      confidence: clamp01(0.5 + (endShare - 0.38) / 0.25),
      title: "Your spending clusters near the end of the month",
      description: `${Math.round(endShare * 100)}% of transactions happen on days 25–31.`,
      evidence: {
        dayOfMonthHistogram,
        endOfMonthShare: endShare,
      },
    });
  }

  // --- Extra patterns (appended): deeper identity + behavior change ---

  // H) Merchant clustering (variant consolidation) – highlights when a cluster is large + fragmented.
  const clusterPatterns = [...merchantClusterMembers.entries()]
    .map(([clusterKey, members]) => {
      const monthlySpend = merchantClusterMonthlySpend.get(clusterKey) ||
        Array(months.length).fill(0);
      const total = monthlySpend.reduce((a, b) => a + b, 0);
      const avg = total / months.length;
      return {
        clusterKey,
        members: [...members].sort(),
        memberCount: members.size,
        monthlySpend,
        total,
        avg,
      };
    })
    .filter((c) => c.memberCount >= 2 && c.total >= totalExpense * 0.05)
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);

  diagnostics.merchantClusters.candidates = merchantClusterMembers.size;

  for (const c of clusterPatterns) {
    patterns.push({
      type: "identity_merchant_cluster",
      key: `merchant_cluster:${c.clusterKey}`,
      confidence: clamp01(0.5 + Math.min(0.4, c.memberCount / 6) + Math.min(0.1, c.total / (totalExpense || 1))),
      title: `You have a "${c.clusterKey}" cluster across multiple labels`,
      description: `This merchant cluster shows up as ${c.memberCount} different names; combined spend averages ~$${c.avg.toFixed(0)}/month.`,
      evidence: {
        months,
        clusterKey: c.clusterKey,
        memberNames: c.members,
        monthlySpend: c.monthlySpend,
        totalSpend: c.total,
        avgMonthlySpend: c.avg,
      },
    });
    diagnostics.merchantClusters.surfaced += 1;
  }

  // I) Contextual routines (merchant + weekday + early/mid/late month) across many months.
  const contextualStats = new Map();
  for (const [key, count] of merchantContextMonthlyCount.entries()) {
    const [merchant, dow, bucket, month] = key.split("|");
    const statKey = `${merchant}|${dow}|${bucket}`;
    const stat = contextualStats.get(statKey) || {
      merchant,
      dow: Number(dow),
      bucket,
      monthsPresent: new Set(),
      totalCount: 0,
      monthlyCounts: Array(months.length).fill(0),
    };
    stat.monthsPresent.add(month);
    stat.totalCount += count;
    const idx = monthIndex.get(month);
    if (idx !== undefined) stat.monthlyCounts[idx] = count;
    contextualStats.set(statKey, stat);
  }

  const contextualRoutines = [...contextualStats.values()]
    .filter((s) => s.monthsPresent.size >= 4)
    .map((s) => {
      const monthsPresent = s.monthsPresent.size;
      const avgPerMonth = s.totalCount / months.length;
      const conf = clamp01(0.45 + monthsPresent / 12 + Math.min(0.35, avgPerMonth / 8));
      return { ...s, monthsPresent, avgPerMonth, confidence: conf };
    })
    .filter((s) => s.avgPerMonth >= 1.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  diagnostics.contextualRoutines.candidates = contextualStats.size;

  for (const r of contextualRoutines) {
    patterns.push({
      type: "identity_contextual_routine",
      key: `context:${r.merchant}:${r.dow}:${r.bucket}`,
      confidence: r.confidence,
      title: `${r.merchant} is a ${r.bucket}-month ${getIsoDayName(r.dow)} pattern`,
      description: `This shows up in ${r.monthsPresent}/6 months (~${r.avgPerMonth.toFixed(1)} times/month).`,
      evidence: {
        months,
        merchant: r.merchant,
        dayOfWeek: r.dow,
        dayName: getIsoDayName(r.dow),
        monthBucket: r.bucket,
        monthlyCounts: r.monthlyCounts,
      },
    });
    diagnostics.contextualRoutines.surfaced += 1;
  }

  // J) Volatility + budget pressure signals (monthly swings + late-month intensity shift)
  const monthlyTotals = expenseByMonth;
  const monthlyMean = mean(monthlyTotals);
  const monthlySd = stddev(monthlyTotals);
  const cv = monthlyMean > 0 ? monthlySd / monthlyMean : 0;
  diagnostics.volatility.cv = cv;

  const spikeMonths = months.filter((m, i) => monthlyMean > 0 && monthlyTotals[i] > monthlyMean + monthlySd);
  if (cv >= 0.22 && monthlyMean > 0) {
    patterns.push({
      type: "behavior_monthly_volatility",
      key: "monthly_volatility",
      confidence: clamp01(0.55 + Math.min(0.35, (cv - 0.22) / 0.35)),
      title: "Your monthly spending swings a lot",
      description: `Month-to-month spend variability is high (CV ${(cv * 100).toFixed(0)}%).`,
      evidence: {
        months,
        monthlyExpense: monthlyTotals,
        meanMonthlyExpense: monthlyMean,
        stddevMonthlyExpense: monthlySd,
        coefficientOfVariation: cv,
        spikeMonths,
      },
    });
    diagnostics.volatility.surfaced += 1;
  }

  // For shift: recompute late-month shares for early vs recent windows from txs
  const lateCounts = { prior: 0, recent: 0, priorTotal: 0, recentTotal: 0 };
  for (const t of txs) {
    const isLate = t.dayOfMonth >= 25;
    const bucket = recentMonths.has(t.month) ? "recent" : earlyMonths.has(t.month) ? "prior" : null;
    if (!bucket) continue;
    lateCounts[`${bucket}Total`] += 1;
    if (isLate) lateCounts[bucket] += 1;
  }
  const priorLateShare = safeDiv(lateCounts.prior, lateCounts.priorTotal);
  const recentLateShare = safeDiv(lateCounts.recent, lateCounts.recentTotal);
  const lateDelta = recentLateShare - priorLateShare;
  diagnostics.lateMonthShift.delta = lateDelta;
  if (Math.abs(lateDelta) >= 0.12 && lateCounts.priorTotal >= 30 && lateCounts.recentTotal >= 30) {
    patterns.push({
      type: "behavior_late_month_shift",
      key: "late_month_shift",
      confidence: clamp01(0.55 + Math.abs(lateDelta) / 0.35),
      title: lateDelta > 0 ? "You’re pushing more spending to the end of the month" : "End-of-month spending eased up",
      description: `Late-month (days 25–31) transaction share moved from ${Math.round(priorLateShare * 100)}% to ${Math.round(recentLateShare * 100)}% (Δ ${Math.round(lateDelta * 100)} pts).`,
      evidence: {
        months,
        priorLateShare,
        recentLateShare,
        delta: lateDelta,
        counts: lateCounts,
      },
    });
    diagnostics.lateMonthShift.surfaced += 1;
  }

  patterns.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const topPatterns = patterns.slice(0, 8);
  const extraPatterns = patterns.slice(8);

  return {
    months,
    totals: {
      transactionsUsed: txs.length,
      totalExpense,
    },
    patterns: topPatterns,
    patterns_extra: extraPatterns,
    meta: {
      patternsGenerated: patterns.length,
      patternsReturned: topPatterns.length,
      patternsExtra: extraPatterns.length,
      diagnostics,
    },
  };
};

export const getPatternFrequencyScore = (pattern) => {
  const evidence = pattern?.evidence;
  if (!evidence || typeof evidence !== "object") return -Infinity;

  const totalCount =
    typeof evidence.totalCount === "number"
      ? evidence.totalCount
      : typeof evidence.totant === "number"
        ? evidence.totant
        : null;
  if (typeof totalCount === "number") return totalCount;

  if (Array.isArray(evidence.monthlyCounts)) {
    const sum = evidence.monthlyCounts.reduce(
      (acc, n) => acc + (typeof n === "number" ? n : 0),
      0
    );
    return sum;
  }

  return -Infinity;
};

export const selectTopTwoPatternsForLLM = (patternPayload) => {
  const patterns = Array.isArray(patternPayload?.patterns) ? patternPayload.patterns : [];
  if (patterns.length === 0) return [];

  return [...patterns]
    .sort((a, b) => {
      const scoreDiff = getPatternFrequencyScore(b) - getPatternFrequencyScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      const monthsDiff =
        (typeof b?.evidence?.monthsPresent === "number" ? b.evidence.monthsPresent : 0) -
        (typeof a?.evidence?.monthsPresent === "number" ? a.evidence.monthsPresent : 0);
      if (monthsDiff !== 0) return monthsDiff;

      const nameA = String(a?.title || a?.key || "");
      const nameB = String(b?.title || b?.key || "");
      return nameB.length - nameA.length;
    })
    .slice(0, 2);
};

export const callOnboardingLLM = async ({
  openRouterApiKey,
  fetchFn,
  patterns,
  analysisWindow = "last 6 months",
  userProfile,
}) => {
  const apiKey = String(openRouterApiKey || "").trim();

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }
  if (typeof fetchFn !== "function") {
    throw new Error("Missing fetchFn");
  }

  const inputPatterns = Array.isArray(patterns) ? patterns : [];

  const inputJson = {
    user_profile: {
      first_name: userProfile?.first_name ?? null,
      age: userProfile?.age ?? null,
      occupation: userProfile?.occupation ?? null,
      location: userProfile?.location ?? null,
      finny_style: userProfile?.finny_style ?? null,
    },
    analysis_window: analysisWindow,
    patterns: inputPatterns,
  };

  const { system, user } = buildOnboardingEarlyInsightsPrompt(inputJson);

  const controller = new AbortController();
  // OpenRouter can occasionally take >10s depending on provider load.
  // Keep this comfortably below the Vercel maxDuration for the route.
  const timeoutMs = 25_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter recommends these headers for better request attribution.
        // Not required for auth, but harmless and can improve provider routing.
        "HTTP-Referer":
          process.env.OPENROUTER_HTTP_REFERER ||
          process.env.VERCEL_URL ||
          "https://financify-rose.vercel.app",
        "X-Title": process.env.OPENROUTER_X_TITLE || "Financify",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Include status code for easier server-side debugging.
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No LLM content returned");

    const extracted = extractFirstJsonObjectFromText(content);
    if (extracted) return { ok: true, json: extracted };

    return { ok: false, raw: content, rawStripped: String(content || "").trim() };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const buildEarlyInsightsJson = async ({
  openRouterApiKey,
  fetchFn,
  transactions,
  userProfile,
  analysisWindow = "last 6 months",
}) => {
  const months = getLast6MonthKeys();
  const filtered = (Array.isArray(transactions) ? transactions : []).filter(
    (tx) => !isLikelyInternalOrPayment(tx)
  );

  const patternPayload = computePatterns({ transactions: filtered, months });
  const topTwoPatterns = selectTopTwoPatternsForLLM(patternPayload);
  if (topTwoPatterns.length === 0) return null;

  const llmResult = await callOnboardingLLM({
    openRouterApiKey,
    fetchFn,
    patterns: topTwoPatterns,
    analysisWindow,
    userProfile,
  });

  if (llmResult?.ok && llmResult?.json) return llmResult.json;

  // Best-effort: some models prepend commentary and wrap JSON in fences.
  const recovered = extractFirstJsonObjectFromText(llmResult?.raw);
  if (recovered) return recovered;

  return null;
};
