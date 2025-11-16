import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import IconButton from "@/src/components/shared/IconButton";
import {
  INSTITUTION_LOGO_MAP,
  LIGHT_BG_LOGO_IDS,
  TEXT_STYLES,
} from "./modal-constants";

interface Institution {
  id: string;
  name: string;
  color: string;
  initials: string;
}

interface ModalLogoContainerProps {
  institution: Institution;
  isLoading?: boolean;
  style?: any;
}

export const ModalLogoContainer: React.FC<ModalLogoContainerProps> = ({
  institution,
  isLoading = false,
  style,
}) => {
  const logoSource = INSTITUTION_LOGO_MAP[institution.id];
  const useLightBg = LIGHT_BG_LOGO_IDS.has(institution.id);

  return (
    <View style={[styles.logoContainer, style]}>
      {isLoading ? (
        <Ionicons name="hourglass" size={32} color="#000" />
      ) : logoSource ? (
        <Image
          source={logoSource}
          style={styles.logoImage}
          resizeMode="contain"
          accessibilityLabel={`${institution.name} logo`}
        />
      ) : (
        <View
          style={[
            styles.logoPlaceholder,
            { backgroundColor: institution.color },
            useLightBg && styles.lightBgLogo,
          ]}
        >
          <Text style={styles.logoText}>{institution.initials}</Text>
        </View>
      )}
    </View>
  );
};

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, onClose }) => (
  <View style={styles.header}>
    <View style={styles.titleContainer}>
      <Text style={TEXT_STYLES.title}>{title}</Text>
    </View>
    <IconButton onPress={onClose} icon="close" size={18} />
  </View>
);

interface ModalHandleProps {}

export const ModalHandle: React.FC<ModalHandleProps> = () => (
  <View style={styles.handleContainer}>
    <View style={styles.handle} />
  </View>
);

interface ModalBlurOverlayProps {
  children: React.ReactNode;
  onPressOutside?: () => void;
}

export const ModalBlurOverlay: React.FC<ModalBlurOverlayProps> = ({
  children,
  onPressOutside,
}) => (
  <Pressable style={styles.overlay} onPress={onPressOutside}>
    <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />
    <Pressable onPress={(e) => e.stopPropagation()}>{children}</Pressable>
  </Pressable>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 10,
  },
  titleContainer: {
    flex: 1,
  },
  handleContainer: {
    width: "100%",
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  logoContainer: {
    width: 55,
    height: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPlaceholder: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    width: 55,
    height: 55,
  },
  lightBgLogo: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  logoText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
});

// Prevent Expo Router from treating this as a route by providing a no-op default export
export default function ModalComponentsPlaceholder() {
  return null;
}
