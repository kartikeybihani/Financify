import React from "react";
import { ScrollView, RefreshControl } from "react-native";
import RecurringSection from "@/src/components/insights/components/RecurringSection";
import SharedBanners from "./SharedBanners";
import { RecurringData } from "@/src/types/insights";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";

interface RecurringPageProps {
  recurringData: RecurringData | null;
  isLoading: boolean;
  titleStyle: any;
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onRunAnalysis?: () => Promise<void>;
}

const RecurringPage = React.memo<RecurringPageProps>(
  ({
    recurringData,
    isLoading,
    titleStyle,
    refreshStatus,
    reAuthItems,
    onReAuth,
    onDismissReAuth,
    onRefresh,
    refreshing,
    onRunAnalysis,
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
        <RecurringSection
          recurringData={recurringData}
          isLoading={isLoading}
          titleStyle={titleStyle}
          onRunAnalysis={onRunAnalysis}
        />
      </ScrollView>
    );
  },
);

RecurringPage.displayName = "RecurringPage";

export default RecurringPage;
