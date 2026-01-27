import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import CashFlowSection from "@/src/components/insights/components/CashFlowSection";
import SharedBanners from "./SharedBanners";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";

interface CashFlowPageProps {
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const CashFlowPage = React.memo<CashFlowPageProps>(
  ({
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
        <CashFlowSection />
      </ScrollView>
    );
  },
);

CashFlowPage.displayName = "CashFlowPage";

export default CashFlowPage;
