import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome } from "@expo/vector-icons";
import { Account } from "@/src/types/plaid";

interface AccountCardProps {
  account: Account;
  onPress?: () => void;
  height?: number;
  showFullCard?: boolean;
}

// Card gradient schemes based on account type
const getAccountGradient = (accountName?: string, accountType?: string) => {
  const normalizedType = (accountType || "").toLowerCase();
  const normalizedName = (accountName || "").toLowerCase();

  // Credit cards
  if (normalizedType.includes("credit") || normalizedName.includes("credit")) {
    return ["#151f59", "#343d70"] as const;
  }

  // Savings accounts
  if (normalizedType.includes("saving") || normalizedName.includes("saving")) {
    return ["#0d7377", "#2bb5a0"] as const;
  }

  // Investment accounts
  if (
    normalizedType.includes("investment") ||
    normalizedName.includes("investment")
  ) {
    return ["#04780d", "#02ab10"] as const;
  }

  // Loan accounts
  if (normalizedType.includes("loan") || normalizedName.includes("loan")) {
    return ["#3b82db", "#0091c7"] as const;
  }

  // Default gradient for checking/depository accounts
  return ["#1a759f", "#5aa3c7"] as const;
};

// Get appropriate icon for account type
const getAccountIcon = (accountType?: string) => {
  const normalizedType = (accountType || "").toLowerCase();

  if (normalizedType.includes("investment")) {
    return "money";
  }

  if (normalizedType.includes("credit")) {
    return "credit-card";
  }

  if (normalizedType.includes("saving")) {
    return "university";
  }

  if (normalizedType.includes("loan")) {
    return "handshake-o";
  }

  // Default for checking/depository accounts
  return "credit-card";
};

export default function AccountCard({
  account,
  onPress,
  height,
  showFullCard = true,
}: AccountCardProps) {
  const { height: screenHeight } = useWindowDimensions();
  const isSmallPhone = screenHeight < 700;
  const isTallPhone = screenHeight >= 840;

  const gradient = getAccountGradient(account.name, account.type);
  const iconName = getAccountIcon(account.type);

  const cardHeight = height || (isSmallPhone ? 45 : isTallPhone ? 85 : 65);

  const cardContent = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.accountCardGradient, { height: cardHeight }]}
    >
      <View style={styles.accountCardOverlay} />
      <View style={[styles.accountCardContent, { height: "100%" }]}>
        <View style={styles.accountCardHeader}>
          <Text style={styles.bankName}>
            {account.institution_name || "Bank"}
          </Text>
          <FontAwesome
            name={iconName as any}
            size={20}
            color="rgba(255,255,255,0.9)"
          />
        </View>
        {showFullCard && (
          <View style={styles.accountCardFooter}>
            <Text style={styles.accountName} numberOfLines={1}>
              {account.name || account.institution_name || "Account"}
            </Text>
            {account.mask && (
              <Text style={styles.accountMask}>•••{account.mask}</Text>
            )}
          </View>
        )}
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <View style={styles.accountCardContainer}>
        <TouchableOpacity
          style={styles.accountCard}
          onPress={onPress}
          activeOpacity={0.8}
        >
          {cardContent}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.accountCardContainer}>
      <View style={styles.accountCard}>{cardContent}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  accountCardContainer: {
    alignItems: "center",
  },
  accountCard: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    width: "90%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  accountCardGradient: {
    padding: 12,
    position: "relative",
  },
  accountCardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  accountCardContent: {
    position: "relative",
    zIndex: 2,
    flex: 1,
    justifyContent: "space-between",
  },
  accountCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  bankName: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.9)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  accountCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  accountName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
    marginRight: 8,
  },
  accountMask: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
  },
});
