import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Share,
  Switch,
  Alert,
  ScrollView,
  DeviceEventEmitter,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AppStorage from "@/src/utils/storage/storage";
import IconButton from "@/src/components/shared/IconButton";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase, supabaseUrl } from "@/src/lib/supabase/supabase";
import FeedbackModal from "@/src/components/modals/FeedbackModal";
import ContactModal from "@/src/components/modals/ContactModal";
import DeleteAccountModal from "@/src/components/modals/DeleteAccountModal";
import {
  handleDisconnectAll,
  syncAllUserTransactions,
} from "@/src/utils/plaid/plaid";
import logger from "@/src/utils/core/logger";
import { TEXT_STYLES } from "@/src/components/shared/modal-constants";
import { notificationService } from "@/src/utils/core/notificationService";
import { useAuthNavigation } from "@/src/contexts/AuthNavigationContext";
import { useDemoMode } from "@/src/contexts/DemoContext";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import { BlurView } from "expo-blur";
import Purchases from "react-native-purchases";
import { Platform } from "react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const { userName } = useLocalSearchParams();
  const { clearAllCache } = useAuthNavigation();
  const { isDemoMode } = useDemoMode();
  const { isPremium } = useSubscription();
  const [userData, setUserData] = useState<any>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isSyncingTransactions, setIsSyncingTransactions] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    const fetchAndSetUserData = async () => {
      try {
        const storedUserData = AppStorage.getItemSync("userData");
        if (storedUserData) {
          setUserData(JSON.parse(storedUserData));
        }
        // Always fetch latest user from Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserData(user);
          AppStorage.setItemSync("userData", JSON.stringify(user));
          logger.info(
            "[SettingsIndex] Current user email:",
            user.user_metadata.full_name + " - " + user.email,
          );
        }
      } catch (error) {
        logger.error("Error fetching user data:", error);
      }
    };
    fetchAndSetUserData();
  }, []);

  // Load notification preferences and permission status
  useEffect(() => {
    const loadNotificationSettings = async () => {
      try {
        // Check if permissions are granted
        const hasPermissions = await notificationService.checkPermissions();

        // Load preferences from storage
        const preferences = await notificationService.loadPreferences();

        // Set toggle state based on permissions and preferences
        setNotificationsEnabled(hasPermissions && preferences.enabled);
      } catch (error) {
        logger.error("Error loading notification settings:", error);
      }
    };
    loadNotificationSettings();
  }, []);

  const performAccountDeletion = async () => {
    try {
      setIsDeletingAccount(true);
      setShowDeleteAccountModal(false);

      // Let the loading overlay paint before starting heavy work
      await new Promise((r) => setTimeout(r, 100));

      logger.info("[SettingsIndex] Starting account deletion...");

      // 1. Disconnect all Plaid + SnapTrade (clean up external services)
      await handleDisconnectAll();

      // 2. Clear local cache
      await clearAllCache();

      // 3. Delete user from Supabase via Edge Function
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("No active session");
      }

      if (!supabaseUrl) {
        throw new Error("Supabase URL not configured");
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "Failed to delete account");
      }

      // 4. Sign out and navigate
      await supabase.auth.signOut();
      logger.info("[SettingsIndex] Account deleted successfully");

      router.dismissAll();
      router.replace("/");
    } catch (error) {
      logger.error("[SettingsIndex] Error deleting account:", error);
      setIsDeletingAccount(false);
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to delete account. Please try again.",
      );
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteAccountModal(true);
  };

  const handleLogout = async () => {
    Alert.alert("Confirm Logout", "Are you sure you want to log out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            setIsLoggingOut(true);
            if (userData?.email) {
              logger.info("[SettingsIndex] Logging out user:", userData.email);
            }

            await clearAllCache();
            await supabase.auth.signOut();
            logger.info("User logged out and cache cleared");

            router.dismissAll();
            router.replace("/");
          } catch (error) {
            logger.error("Error during logout:", error);
            setIsLoggingOut(false);
            Alert.alert(
              "Logout Error",
              "Something went wrong. Please try again.",
            );
          }
        },
      },
    ]);
  };

  const handleCallUs = () => {
    setShowContactModal(true);
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message:
          "Hey! This is Finny - Money Coach to guide you to right money decisions! https://usefinny.com",
      });
    } catch (error) {
      logger.error("Error sharing app:", error);
    }
  };

  const handleManageSubscription = async () => {
    if (Platform.OS !== "ios") {
      Alert.alert(
        "Not Available",
        "Subscription management is only available on iOS.",
      );
      return;
    }
    try {
      await Purchases.showManageSubscriptions();
    } catch (error: any) {
      logger.error("Error showing manage subscriptions:", error);
      Alert.alert(
        "Error",
        error?.message ||
          "Unable to open subscription management. Please try again.",
      );
    }
  };

  const handleSyncTransactions = async () => {
    try {
      setIsSyncingTransactions(true);
      logger.info("[SettingsIndex] Starting transaction sync...");

      const result = await syncAllUserTransactions();
      const synced = result.synced || 0;
      const total = result.total ?? synced;
      const results = Array.isArray(result.results) ? result.results : [];
      const failed = results.filter((entry) => entry?.error).length;
      const requiresUpdateCount = results.filter(
        (entry) => entry?.requires_update_mode,
      ).length;

      logger.info("[SettingsIndex] Transaction sync results:", result);

      if (total === 0) {
        Alert.alert(
          "No Account Found",
          "Please connect a bank account first to sync transactions.",
        );
        return;
      }

      if (synced > 0) {
        DeviceEventEmitter.emit("financialDataRefreshed", {
          accounts: [],
          identity: null,
          investments: null,
          liabilities: null,
          institution: null,
        });
      }

      if (failed > 0) {
        const reauthMessage =
          requiresUpdateCount > 0
            ? " Some accounts need reconnection to continue syncing."
            : "";

        Alert.alert(
          synced === 0 ? "Sync Failed" : "Sync Partially Complete",
          synced === 0
            ? `Unable to sync any bank connections.${reauthMessage}`
            : `Synced ${synced}/${total} bank connection(s).${reauthMessage}`,
        );
      } else {
        Alert.alert(
          "Sync Complete",
          `Synced ${synced}/${total} bank connection(s).`,
        );
      }
    } catch (error: any) {
      logger.error("[SettingsIndex] Error syncing transactions:", error);
      Alert.alert(
        "Sync Failed",
        error?.message || "Failed to sync transactions. Please try again.",
      );
    } finally {
      setIsSyncingTransactions(false);
    }
  };

  const renderSettingsItem = (
    icon: JSX.Element,
    title: string,
    onPress: () => void,
    showBorder = true,
    rightElement?: JSX.Element,
    disabled = false,
    disableWithoutStyling = false,
  ) => {
    const showDisabledStyle = disabled && !disableWithoutStyling;
    return (
      <TouchableOpacity
        style={[
          styles.settingsItem,
          showBorder && styles.settingsItemBorder,
          showDisabledStyle && styles.settingsItemDisabled,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <View style={styles.settingsItemLeft}>
          {icon}
          <Text
            style={[
              styles.settingsItemText,
              showDisabledStyle && styles.settingsItemTextDisabled,
            ]}
          >
            {title}
          </Text>
        </View>
        {rightElement || (
          <MaterialIcons
            name="chevron-right"
            size={24}
            color={showDisabledStyle ? "#444" : "#666"}
          />
        )}
      </TouchableOpacity>
    );
  };

  const renderSwitchItem = (
    icon: JSX.Element,
    title: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    showBorder = true,
    disabled = false,
    disableWithoutStyling = false,
  ) => {
    const showDisabledStyle = disabled && !disableWithoutStyling;
    return (
      <View
        style={[
          styles.settingsItem,
          showBorder && styles.settingsItemBorder,
          showDisabledStyle && styles.settingsItemDisabled,
        ]}
      >
        <View style={styles.settingsItemLeft}>
          {icon}
          <Text
            style={[
              styles.settingsItemText,
              showDisabledStyle && styles.settingsItemTextDisabled,
            ]}
          >
            {title}
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: "#333", true: "#4A90E2" }}
          thumbColor={value ? "#fff" : "#f4f3f4"}
        />
      </View>
    );
  };

  const renderSettingsGroup = (title: string, children: React.ReactNode) => (
    <View style={styles.settingsGroup}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.settingsGroupContent}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <IconButton
              icon="chevron-back-sharp"
              onPress={() => router.back()}
              size={22}
              style={TEXT_STYLES.closeButton}
            />
            <View style={styles.profileInfo}>
              <Text style={styles.userName}>
                {userData?.user_metadata?.full_name ||
                  userName ||
                  "Your Profile"}
              </Text>
              <Text style={styles.userEmail}>
                {userData?.email || "Loading..."}
              </Text>
            </View>
          </View>
        </View>

        {renderSettingsGroup(
          "Account",
          <>
            {renderSettingsItem(
              <Ionicons name="person-outline" size={24} color="#4A90E2" />,
              "Personal Information",
              () =>
                router.push({
                  pathname: "/settings/personal-info",
                  params: { userName },
                }),
              true,
              undefined,
              isDemoMode,
              isDemoMode,
            )}
            {renderSettingsItem(
              <Ionicons name="refresh-outline" size={24} color="#4A90E2" />,
              "Sync Transactions",
              handleSyncTransactions,
              true,
              isSyncingTransactions ? (
                <ActivityIndicator size="small" color="#4A90E2" />
              ) : (
                <MaterialIcons name="chevron-right" size={24} color="#666" />
              ),
              isDemoMode,
              isDemoMode,
            )}
            {/* {renderSettingsItem(
              <Ionicons name="card-outline" size={24} color="#4A90E2" />,
              "Connected Accounts",
              () => {},
              true
            )} */}
            {renderSwitchItem(
              <Ionicons
                name="notifications-outline"
                size={24}
                color="#4A90E2"
              />,
              "Push Notifications",
              notificationsEnabled,
              async (value: boolean) => {
                if (value) {
                  // User wants to enable notifications
                  try {
                    // Check if permissions are already granted
                    const hasPermissions =
                      await notificationService.checkPermissions();

                    if (!hasPermissions) {
                      // Request permissions if not granted
                      const granted =
                        await notificationService.requestPermissions();
                      if (!granted) {
                        // Permissions denied, keep toggle off
                        setNotificationsEnabled(false);
                        Alert.alert(
                          "Permission Required",
                          "Please enable notification permissions in your device settings to receive push notifications.",
                        );
                        return;
                      }
                    } else {
                      // Permissions already granted, just register token to ensure it's up to date
                      await notificationService.registerPushToken();
                    }

                    // Load current preferences and update
                    const preferences =
                      await notificationService.loadPreferences();
                    const updatedPreferences = {
                      ...preferences,
                      enabled: true,
                    };
                    await notificationService.savePreferences(
                      updatedPreferences,
                    );
                    await notificationService.scheduleNotifications(
                      updatedPreferences,
                    );
                    await notificationService.syncPreferencesToDatabase();
                    setNotificationsEnabled(true);
                    logger.info("✅ Push notifications enabled");
                  } catch (error) {
                    logger.error("Error enabling notifications:", error);
                    setNotificationsEnabled(false);
                    Alert.alert(
                      "Error",
                      "Failed to enable notifications. Please try again.",
                    );
                  }
                } else {
                  // User wants to disable notifications
                  try {
                    // Update preferences but keep token registered (in case they re-enable)
                    const preferences =
                      await notificationService.loadPreferences();
                    const updatedPreferences = {
                      ...preferences,
                      enabled: false,
                    };
                    await notificationService.savePreferences(
                      updatedPreferences,
                    );
                    // Cancel scheduled notifications
                    await notificationService.cancelAllNotifications();
                    await notificationService.syncPreferencesToDatabase();
                    setNotificationsEnabled(false);
                    logger.info("ℹ️ Push notifications disabled");
                  } catch (error) {
                    logger.error("Error disabling notifications:", error);
                    Alert.alert(
                      "Error",
                      "Failed to disable notifications. Please try again.",
                    );
                  }
                }
              },
              true,
              isDemoMode,
              isDemoMode,
            )}
            {/* {renderSwitchItem(
              <Ionicons name="finger-print" size={24} color="#4A90E2" />,
              "Biometric Login",
              biometricsEnabled,
              setBiometricsEnabled,
              false
            )} */}
          </>,
        )}

        {renderSettingsGroup(
          "Support",
          <>
            {renderSettingsItem(
              <MaterialIcons name="feedback" size={24} color="#4A90E2" />,
              "Give Feedback",
              () => setShowFeedbackModal(true),
              true,
              undefined,
              isDemoMode,
              isDemoMode,
            )}
            {renderSettingsItem(
              <Ionicons name="call-outline" size={24} color="#4A90E2" />,
              "Contact Us",
              handleCallUs,
              true,
              undefined,
              isDemoMode,
              isDemoMode,
            )}
            {renderSettingsItem(
              <Ionicons name="share-outline" size={24} color="#4A90E2" />,
              "Share the App",
              handleShareApp,
              true,
              undefined,
              isDemoMode,
              isDemoMode,
            )}
            {renderSettingsItem(
              <Ionicons name="card-outline" size={24} color="#4A90E2" />,
              "Manage Subscription",
              handleManageSubscription,
              false,
              isPremium ? (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>PRO</Text>
                </View>
              ) : undefined,
              isDemoMode || Platform.OS !== "ios",
              isDemoMode || Platform.OS !== "ios",
            )}
          </>,
        )}

        {renderSettingsGroup(
          "Data",
          <>
            {renderSettingsItem(
              <MaterialIcons name="logout" size={24} color="#ff6b6b" />,
              "Log Out",
              handleLogout,
              false,
              undefined,
              isDemoMode,
              isDemoMode,
            )}
          </>,
        )}

        <View style={styles.footer}>
          <Text style={styles.version}>Version 1.0.0</Text>
          <Text style={styles.copyright}>© 2026 Finny</Text>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={isDemoMode}
            style={styles.deleteAccountButton}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.deleteAccountText,
                isDemoMode && styles.deleteAccountTextDisabled,
              ]}
            >
              Delete Account
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        userName={userData?.user_metadata?.full_name || userName || ""}
      />

      <ContactModal
        visible={showContactModal}
        onClose={() => setShowContactModal(false)}
      />

      <DeleteAccountModal
        visible={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        onDelete={performAccountDeletion}
        isDeleting={isDeletingAccount}
      />

      <Modal
        visible={isLoggingOut || isDeletingAccount}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.logoutOverlay}>
          <BlurView
            intensity={40}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.logoutOverlayContent}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.logoutOverlayText}>
              {isDeletingAccount ? "Deleting account..." : "Logging out..."}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  logoutOverlay: {
    flex: 1,
  },
  logoutOverlayContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutOverlayText: {
    marginTop: 12,
    fontSize: 16,
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2c",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: 0.5,
  },
  userEmail: {
    fontSize: 13,
    color: "#888",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  settingsGroup: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginBottom: 12,
    marginLeft: 4,
  },
  settingsGroupContent: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  settingsItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsItemText: {
    fontSize: 16,
    color: "#fff",
    marginLeft: 15,
  },
  settingsItemDisabled: {
    opacity: 0.5,
  },
  settingsItemTextDisabled: {
    color: "#666",
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
    marginTop: 10,
  },
  version: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  copyright: {
    fontSize: 12,
    color: "#666",
  },
  deleteAccountButton: {
    marginTop: 20,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#ff6b6b",
    borderRadius: 8,
  },
  deleteAccountText: {
    fontSize: 14,
    color: "#ff6b6b",
  },
  deleteAccountTextDisabled: {
    color: "#666",
  },
  premiumBadge: {
    backgroundColor: "#4A90E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  premiumBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
