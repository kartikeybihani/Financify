/**
 * Data synthesis for Finny prompts.
 * Formats raw financial data into structured, LLM-friendly context.
 */

export function synthesizeFinancialData(financialData, intent = null) {
  if (!financialData || !financialData.base) {
    console.log("⚠️ [FINANCIAL_DATA] No financial data or base pack provided");
    return {
      formattedContext: "Financial data not available",
    };
  }

  const base = financialData.base || {};
  const {
    liquidAssets = 0,
    totalLiabilities = 0,
    netWorth = 0,
    investmentsTotal = 0,
    accounts = [],
    recentTransactions = [],
    spendByCategory = [],
    spendByCategoryCurrentMonth = [],
    spendByCategoryLastMonth = [],
    budget = null,
  } = base;

  console.log("📊 [FINANCIAL_DATA] Formatting financial data:");
  console.log(
    `   - Base pack: netWorth=$${netWorth.toFixed(
      2,
    )}, liquidAssets=$${liquidAssets.toFixed(
      2,
    )}, liabilities=$${totalLiabilities.toFixed(2)}`,
  );
  console.log(
    `   - Transactions: ${
      Array.isArray(recentTransactions) ? recentTransactions.length : 0
    } transactions`,
  );
  console.log(
    `   - Accounts: ${Array.isArray(accounts) ? accounts.length : 0} accounts`,
  );
  console.log(
    `   - Cashflow: ${financialData.cashflow ? "present" : "missing"}`,
  );
  console.log(`   - Spend: ${financialData.spend ? "present" : "missing"}`);
  console.log(
    `   - CategoryDetails: ${
      financialData.categoryDetails ? "present" : "missing"
    }`,
  );

  const sections = [];

  sections.push(`NET WORTH OVERVIEW:
- Net Worth: $${netWorth.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- Liquid Assets (cash, checking, savings): $${liquidAssets.toLocaleString(
    undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}
- Investment Assets: $${investmentsTotal.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}
- Total Liabilities (debt): $${totalLiabilities.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`);

  if (Array.isArray(accounts) && accounts.length > 0) {
    const accountLines = accounts.map((acc) => {
      const name =
        acc.name || acc.official_name || acc.account_id || "Unknown Account";
      const balance =
        acc.balances?.current ?? acc.current_balance ?? acc.balance ?? 0;
      const type = acc.type || "unknown";
      const subtype = acc.subtype || "";
      const limit = acc.balances?.limit;

      let line = `- ${name}: $${Math.abs(balance).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} (${type}${subtype ? `/${subtype}` : ""})`;

      if (limit && (type === "credit" || subtype === "credit card")) {
        const utilization =
          limit > 0 ? ((Math.abs(balance) / limit) * 100).toFixed(1) : 0;
        line += ` | Limit: $${limit.toLocaleString()} | Utilization: ${utilization}%`;
      }

      return line;
    });

    sections.push(`ACCOUNTS (${accounts.length} total):
${accountLines.join("\n")}`);
  }

  if (Array.isArray(recentTransactions) && recentTransactions.length > 0) {
    const transactionLines = recentTransactions.slice(0, 10).map((txn) => {
      const merchant = txn.merchant || txn.name || "Unknown";
      const amount = txn.amount || 0;
      const date = txn.date || "";
      const isIncome = amount < 0;
      const amountDisplay = isIncome
        ? `+$${Math.abs(amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}(Income/credits/refunds)`
        : `-$${Math.abs(amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} (Expenses)`;
      return `- ${date ? `${date} | ` : ""}${merchant}: ${amountDisplay}`;
    });

    sections.push(`RECENT TRANSACTIONS (last ${recentTransactions.length}):
NOTE: Positive amounts are Income/credits/refunds, negative amounts are Expenses.
${transactionLines.join("\n")}`);
  }

  const formatMonthYear = (date) => {
    const d = new Date(date);
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  const now = new Date();
  const currentMonthName = formatMonthYear(now);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthName = formatMonthYear(lastMonth);

  if (
    Array.isArray(spendByCategoryCurrentMonth) &&
    spendByCategoryCurrentMonth.length > 0
  ) {
    const categoryLines = spendByCategoryCurrentMonth.map((cat) => {
      const category = cat.category || cat.name || "Unknown";
      const total = cat.total_spend || cat.amount || 0;
      return `- ${category}: $${total.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    });

    sections.push(`SPENDING BY CATEGORY - CURRENT MONTH (${currentMonthName}):
${categoryLines.join("\n")}`);
  }

  if (
    Array.isArray(spendByCategoryLastMonth) &&
    spendByCategoryLastMonth.length > 0
  ) {
    const categoryLines = spendByCategoryLastMonth.map((cat) => {
      const category = cat.category || cat.name || "Unknown";
      const total = cat.total_spend || cat.amount || 0;
      return `- ${category}: $${total.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    });

    sections.push(`SPENDING BY CATEGORY - LAST COMPLETE MONTH (${lastMonthName}):
${categoryLines.join("\n")}`);
  }

  if (
    (!Array.isArray(spendByCategoryCurrentMonth) ||
      spendByCategoryCurrentMonth.length === 0) &&
    (!Array.isArray(spendByCategoryLastMonth) ||
      spendByCategoryLastMonth.length === 0) &&
    Array.isArray(spendByCategory) &&
    spendByCategory.length > 0
  ) {
    const categoryLines = spendByCategory.map((cat) => {
      const category = cat.category || cat.name || "Unknown";
      const total = cat.total_spend || cat.amount || 0;
      return `- ${category}: $${total.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    });

    sections.push(`SPENDING BY CATEGORY (last 30 days):
${categoryLines.join("\n")}`);
  }

  if (budget && typeof budget === "object") {
    const budgetCurrency = budget.currency_code || "USD";
    const totalBudget = Number(budget.total_budget || 0);
    const periodStart = budget.period_start || "";
    const periodEnd = budget.period_end || "";
    const categories = Array.isArray(budget.categories)
      ? budget.categories
      : [];

    const safeLimit = (val) => {
      const num = Number(val || 0);
      if (!Number.isFinite(num)) return 0;
      return num;
    };

    const sorted = categories
      .map((c) => ({
        category: c?.category || "Unknown",
        limit: safeLimit(c?.limit),
      }))
      .sort((a, b) => b.limit - a.limit);

    const maxLines = 25;
    const shown = sorted.slice(0, maxLines);
    const hiddenCount = Math.max(0, sorted.length - shown.length);

    const lines = shown.map(
      (c) =>
        `- ${c.category}: $${c.limit.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${budgetCurrency}`,
    );

    const headerBits = [
      periodStart && periodEnd ? `${periodStart} to ${periodEnd}` : null,
      budget.status ? `status=${budget.status}` : null,
    ].filter(Boolean);

    sections.push(
      `BUDGET (current month${
        headerBits.length ? ` | ${headerBits.join(", ")}` : ""
      }):\n` +
        `- Total budget (sum of category limits): $${totalBudget.toLocaleString(
          undefined,
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )} ${budgetCurrency}` +
        (lines.length
          ? `\n${lines.join("\n")}`
          : "\n- No category limits set") +
        (hiddenCount > 0 ? `\n- (+${hiddenCount} more categories)` : ""),
    );
  }

  if (financialData.cashflow) {
    if (
      Array.isArray(financialData.cashflow) &&
      financialData.cashflow.length > 0
    ) {
      const cashflowLines = financialData.cashflow.map((cf, idx) => {
        const month = cf.month || cf.period || `Month ${idx + 1}`;
        const income = cf.income || 0;
        const expense = cf.expense || 0;
        const net = income - expense;
        return `- ${month}: Income $${income.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}, Expenses $${expense.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}, Net $${net.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`MONTHLY CASHFLOW (last ${
        financialData.cashflow.length
      } months):
${cashflowLines.join("\n")}`);
    } else if (financialData.cashflow.averageIncome) {
      sections.push(`CASHFLOW SUMMARY:
- Average Monthly Income: $${financialData.cashflow.averageIncome.toLocaleString(
        undefined,
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )}
- Average Monthly Expenses: $${(
        financialData.cashflow.averageExpenses || 0
      ).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
- Average Monthly Net: $${(
        financialData.cashflow.averageIncome -
        (financialData.cashflow.averageExpenses || 0)
      ).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`);
    }
  } else if (
    typeof financialData.profileMonthlyIncome === "number" &&
    Number.isFinite(financialData.profileMonthlyIncome) &&
    financialData.profileMonthlyIncome > 0
  ) {
    sections.push(`INCOME CONTEXT:
- Monthly Income (user-provided): $${financialData.profileMonthlyIncome.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    )}
- Note: Cashflow pack unavailable, using profile income as fallback context.`);
  }

  if (financialData.invest) {
    const invest = financialData.invest;
    if (Array.isArray(invest.holdings) && invest.holdings.length > 0) {
      const holdingLines = invest.holdings.map((holding) => {
        const symbol = holding.symbol || "Unknown";
        const description = holding.description || "";
        const units = holding.units || holding.quantity || 0;
        const value = holding.market_value || holding.value || 0;
        return `- ${symbol}${
          description ? ` (${description})` : ""
        }: ${units} units, Market Value $${value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`INVESTMENT HOLDINGS:
${holdingLines.join("\n")}`);
    }

    if (Array.isArray(invest.balances) && invest.balances.length > 0) {
      const balanceLines = invest.balances.map((bal) => {
        const account = bal.account_name || bal.name || "Unknown Account";
        const balance = bal.balance || bal.current_balance || 0;
        return `- ${account}: $${balance.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      });

      sections.push(`INVESTMENT ACCOUNT BALANCES:
${balanceLines.join("\n")}`);
    }
  }

  if (
    financialData.goals &&
    financialData.goals.goals &&
    Array.isArray(financialData.goals.goals) &&
    financialData.goals.goals.length > 0
  ) {
    const goalLines = financialData.goals.goals.map((goal) => {
      const name = goal.label || goal.name || "Unknown Goal";
      const target = goal.target_amount || 0;
      const current = goal.current_amount || 0;
      const progress =
        goal.progress_pct ||
        (target > 0 ? ((current / target) * 100).toFixed(1) : 0);
      const targetDate = goal.target_date || "";
      return `- ${name}: $${current.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} / $${target.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} (${progress}%)${targetDate ? ` | Target: ${targetDate}` : ""}`;
    });

    sections.push(`FINANCIAL GOALS:
${goalLines.join("\n")}`);
  }

  if (financialData.categoryDetails) {
    const catDetails = financialData.categoryDetails;
    console.log("📊 [PROMPT_ENGINE] categoryDetails pack received:", {
      hasCategory: !!catDetails.category,
      hasMerchant: !!catDetails.merchant,
      hasTransactions: Array.isArray(catDetails.transactions),
      transactionCount: Array.isArray(catDetails.transactions)
        ? catDetails.transactions.length
        : 0,
      totalSpend: catDetails.total_spend || null,
      txnCount: catDetails.txn_count || null,
      sampleTransactions: Array.isArray(catDetails.transactions)
        ? catDetails.transactions.slice(0, 3)
        : [],
    });

    if (
      Array.isArray(catDetails.transactions) &&
      catDetails.transactions.length > 0
    ) {
      const txnLines = catDetails.transactions.map((txn) => {
        const date = txn.date || "Unknown date";
        const amount = Number(txn.amount) || 0;
        const merchant = txn.merchant || txn.name || "Unknown merchant";
        const name = txn.name || merchant;
        const direction =
          txn.direction ||
          (amount > 0 ? "sent" : amount < 0 ? "received" : "neutral");

        const isBidirectional =
          catDetails.merchant &&
          ((catDetails.total_sent !== undefined &&
            catDetails.total_received !== undefined) ||
            (catDetails.sent_count !== undefined &&
              catDetails.received_count !== undefined) ||
            (catDetails.sent_count > 0 && catDetails.received_count > 0));

        const amountDisplay = Math.abs(amount);
        let line = `- ${date} | ${merchant}${
          name !== merchant ? ` (${name})` : ""
        }: $${amountDisplay.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

        if (isBidirectional && direction !== "neutral") {
          line += ` [${direction}]`;
        }

        return line;
      });

      let headerLabel;
      if (catDetails.merchant) {
        headerLabel = `MERCHANT TRANSACTIONS (${catDetails.merchant}`;
      } else if (catDetails.category) {
        headerLabel = `CATEGORY TRANSACTIONS (${catDetails.category}`;
      } else {
        headerLabel = `TRANSACTIONS`;
      }

      let sectionContent = `${headerLabel}${
        catDetails.period ? ` - ${catDetails.period}` : ""
      }):\n${txnLines.join("\n")}`;

      const isBidirectional =
        catDetails.merchant &&
        ((catDetails.total_sent !== undefined &&
          catDetails.total_received !== undefined) ||
          (catDetails.sent_count !== undefined &&
            catDetails.received_count !== undefined) ||
          (catDetails.sent_count > 0 && catDetails.received_count > 0));

      if (
        isBidirectional &&
        (catDetails.total_sent !== undefined ||
          catDetails.total_received !== undefined)
      ) {
        let breakdownLines = [];

        if (catDetails.total_sent !== undefined) {
          breakdownLines.push(
            `Sent: $${catDetails.total_sent.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} (${catDetails.sent_count || 0} transaction${
              (catDetails.sent_count || 0) !== 1 ? "s" : ""
            })`,
          );
        }

        if (catDetails.total_received !== undefined) {
          breakdownLines.push(
            `Received: $${catDetails.total_received.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} (${catDetails.received_count || 0} transaction${
              (catDetails.received_count || 0) !== 1 ? "s" : ""
            })`,
          );
        }

        if (breakdownLines.length > 0) {
          sectionContent += `\n\n${breakdownLines.join(" | ")}`;
        }
        sectionContent += `\nTotal: ${
          catDetails.txn_count || catDetails.transactions.length
        } transaction${
          catDetails.txn_count !== 1 && catDetails.transactions.length !== 1
            ? "s"
            : ""
        }`;
      } else if (
        catDetails.total_spend !== undefined &&
        catDetails.total_spend !== null
      ) {
        sectionContent += `\n\nTotal: $${Math.abs(
          catDetails.total_spend,
        ).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} across ${
          catDetails.txn_count || catDetails.transactions.length
        } transaction${
          catDetails.txn_count !== 1 && catDetails.transactions.length !== 1
            ? "s"
            : ""
        }`;
      } else {
        sectionContent += `\n\nTotal: ${
          catDetails.transactions.length
        } transaction${catDetails.transactions.length !== 1 ? "s" : ""}`;
      }

      sections.push(sectionContent);

      if (
        catDetails.monthlyBreakdown &&
        Array.isArray(catDetails.monthlyBreakdown) &&
        catDetails.monthlyBreakdown.length > 0
      ) {
        const monthlyLines = catDetails.monthlyBreakdown.map((month) => {
          const monthDate = month.month || "Unknown";
          const spend = month.total_spend || 0;
          const count = month.txn_count || 0;
          return `- ${monthDate}: $${Math.abs(spend).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} (${count} transactions)`;
        });
        const breakdownLabel = catDetails.merchant
          ? `MONTHLY BREAKDOWN (${catDetails.merchant})`
          : `MONTHLY BREAKDOWN (${catDetails.category || "Transactions"})`;
        sections.push(`${breakdownLabel}:\n${monthlyLines.join("\n")}`);
      }
    }
  }

  return {
    formattedContext: sections.join("\n\n"),
  };
}

export function prioritizeMemories(memories, query, intent) {
  if (!memories || !Array.isArray(memories) || memories.length === 0) {
    return [];
  }

  const scoredMemories = memories.map((memory) => {
    let score = 0;

    if (memory.similarity !== undefined) {
      score += memory.similarity * 0.5;
    }

    if (memory.updatedAt) {
      const daysAgo =
        (Date.now() - new Date(memory.updatedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - daysAgo / 365);
      score += recencyScore * 0.2;
    }

    if (intent && memory.context_type) {
      const typeMatch = {
        goal_conversation: ["goal", "decision"],
        ask_personalized: ["preference", "constraint", "life_event"],
      };
      if (
        typeMatch[intent] &&
        typeMatch[intent].includes(memory.context_type)
      ) {
        score += 0.2;
      }
    }

    if (
      memory.content &&
      (memory.content.toLowerCase().includes("should") ||
        memory.content.toLowerCase().includes("recommend") ||
        memory.content.toLowerCase().includes("goal"))
    ) {
      score += 0.1;
    }

    return { ...memory, relevanceScore: score };
  });

  const topMemories = scoredMemories
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);

  return topMemories.map((memory) => {
    const content = memory.content || memory.summary || "";
    let synthesized = content;
    if (synthesized.length > 200) {
      const truncated = synthesized.substring(0, 200);
      const lastPeriod = truncated.lastIndexOf(".");
      const lastExclamation = truncated.lastIndexOf("!");
      const lastQuestion = truncated.lastIndexOf("?");
      const lastBoundary = Math.max(lastPeriod, lastExclamation, lastQuestion);
      if (lastBoundary > 100) {
        synthesized = synthesized.substring(0, lastBoundary + 1);
      } else {
        synthesized = truncated + "...";
      }
    }

    return {
      insight: synthesized,
      type: memory.context_type || "general",
      relevance: memory.relevanceScore,
    };
  });
}
