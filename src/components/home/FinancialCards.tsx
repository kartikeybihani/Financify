// components/home/FinancialCards.tsx

import React from "react";
import { View } from "react-native";
import FinancialCard from "@/src/components/shared/FinancialCard";
import { styles } from "@/src/styles/homeStyles";

interface FinancialCardsProps {
  accountsTotal: number;
  investmentsTotal: number;
  liabilitiesTotal: number;
  formatCurrency: (amount: number, currency?: string, options?: any) => string;
  onCardPress: (cardType: "accounts" | "investments" | "liabilities") => void;
}

export const FinancialCards: React.FC<FinancialCardsProps> = React.memo(
  ({
    accountsTotal,
    investmentsTotal,
    liabilitiesTotal,
    formatCurrency,
    onCardPress,
  }) => {
    return (
      <View style={styles.summaryRow}>
        <FinancialCard
          title="Accounts"
          amount={formatCurrency(accountsTotal, "USD", {
            decimals: 1,
            useKM: true,
          })}
          icon="wallet-outline"
          onPress={() => onCardPress("accounts")}
          iconColor="#4A90E2"
        />
        <FinancialCard
          title="Investments"
          amount={formatCurrency(investmentsTotal, "USD", {
            decimals: 1,
            useKM: true,
          })}
          icon="trending-up"
          onPress={() => onCardPress("investments")}
          iconColor="#4ECDC4"
        />
        <FinancialCard
          title="Liabilities"
          amount={formatCurrency(liabilitiesTotal, "USD", {
            decimals: 1,
            useKM: true,
          })}
          icon="card-outline"
          onPress={() => onCardPress("liabilities")}
          iconColor="#FF6B6B"
        />
      </View>
    );
  }
);

FinancialCards.displayName = "FinancialCards";
