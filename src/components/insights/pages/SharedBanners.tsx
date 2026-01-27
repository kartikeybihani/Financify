import React from "react";
import { View } from "react-native";
import ReAuthBanner from "@/src/components/ui/ReAuthBanner";
import { RefreshStatus as RefreshStatusComponent } from "@/src/shared/components/LoadingStates";
import { ReAuthItem, RefreshStatus } from "@/src/types/insights";

interface SharedBannersProps {
  refreshStatus: RefreshStatus;
  reAuthItems: ReAuthItem[];
  onReAuth: (item_id: string) => void;
  onDismissReAuth: (item_id: string) => void;
}

export default function SharedBanners({
  refreshStatus,
  reAuthItems,
  onReAuth,
  onDismissReAuth,
}: SharedBannersProps) {
  return (
    <View>
      {/* Refresh Status Indicator */}
      {refreshStatus.type && (
        <RefreshStatusComponent
          message={refreshStatus.message}
          type="loading"
        />
      )}

      {/* Re-auth and new accounts banners */}
      {reAuthItems
        .filter((item) => !item.dismissed)
        .map((item) => (
          <ReAuthBanner
            key={item.item_id}
            institutionName={item.institution_name}
            onReAuth={() => onReAuth(item.item_id)}
            onDismiss={() => onDismissReAuth(item.item_id)}
            type={item.type || "re_auth"}
          />
        ))}
    </View>
  );
}
