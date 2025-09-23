import React from "react";
import { View, Text } from "react-native";
import RecurringTransactionsCard from "../../insights/RecurringTransactionsCard";

interface Props {
  recurringData: {
    subscriptions: any[];
    income: any[];
    bills: any[];
    other: any[];
  } | null;
  isLoading: boolean;
  titleStyle: any;
}

export default function RecurringSection({
  recurringData,
  isLoading,
  titleStyle,
}: Props) {
  return (
    <View>
      <Text style={titleStyle}>Recurring Transactions</Text>
      <View style={{ paddingHorizontal: 8, marginTop: 8 }}>
        <RecurringTransactionsCard
          subscriptions={recurringData?.subscriptions || []}
          bills={recurringData?.bills || []}
          income={recurringData?.income || []}
          other={recurringData?.other || []}
          onViewAll={() => {}}
          isLoading={isLoading}
        />
      </View>
    </View>
  );
}
