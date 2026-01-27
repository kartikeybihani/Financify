import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import InvestmentsScreen from "@/app/investments";
import SharedBanners from "./SharedBanners";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";

interface InvestmentsPageProps {
  preloadedData: {
    holdings: any[];
    options: any[];
    balances: any[];
    connections: any[];
  };
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const InvestmentsPage = React.memo<InvestmentsPageProps>(
  ({
    preloadedData,
    refreshStatus,
    reAuthItems,
    onReAuth,
    onDismissReAuth,
    onRefresh,
    refreshing,
  }) => {
    return (
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4A90E2"
            colors={["#4A90E2"]}
            progressBackgroundColor="#1f1f1f"
          />
        }
      >
        <SharedBanners
          refreshStatus={refreshStatus}
          reAuthItems={reAuthItems}
          onReAuth={onReAuth}
          onDismissReAuth={onDismissReAuth}
        />
        <InvestmentsScreen preloadedData={preloadedData} />
      </ScrollView>
    );
  },
);

InvestmentsPage.displayName = "InvestmentsPage";

export default InvestmentsPage;
