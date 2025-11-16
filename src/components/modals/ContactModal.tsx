import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { TEXT_STYLES } from "../shared/modal-constants";
import IconButton from "../shared/IconButton";

interface ContactModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ContactModal({ visible, onClose }: ContactModalProps) {
  const handleEmailPress = async () => {
    const email = "finnyadvisor@gmail.com";
    const subject = "Support Request";

    try {
      // Try to open Gmail app first
      const gmailUrl = `googlegmail://co?to=${email}&subject=${encodeURIComponent(
        subject
      )}`;
      const canOpenGmail = await Linking.canOpenURL(gmailUrl);

      if (canOpenGmail) {
        await Linking.openURL(gmailUrl);
      } else {
        // Fallback to default mailto
        const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(
          subject
        )}`;
        await Linking.openURL(mailtoUrl);
      }
    } catch (error) {
      // Final fallback
      const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(
        subject
      )}`;
      Linking.openURL(mailtoUrl).catch((err) => {
        console.error("Error opening email:", err);
      });
    }
  };

  const handleCallPress = () => {
    const phoneNumber = "+12133543710";
    const telUrl = `tel:${phoneNumber}`;

    Linking.openURL(telUrl).catch((error) => {
      console.error("Error making call:", error);
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Contact us</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <IconButton onPress={onClose} icon="close" size={20} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            We are here to help and reach out to us for bug reports, feature
            requests, or any question you might have
          </Text>

          <View style={styles.contactOptions}>
            {/* Email Support Box */}
            <TouchableOpacity
              style={styles.contactBox}
              onPress={handleEmailPress}
              activeOpacity={0.7}
            >
              <View style={styles.contactBoxContent}>
                <View style={styles.iconContainer}>
                  <Ionicons name="mail-outline" size={24} color="#4A90E2" />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Email support</Text>
                  <Text style={styles.contactValue}>
                    finnyadvisor@gmail.com
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#666"
                  style={styles.chevron}
                />
              </View>
            </TouchableOpacity>

            {/* Call Us Box */}
            <TouchableOpacity
              style={styles.contactBox}
              onPress={handleCallPress}
              activeOpacity={0.7}
            >
              <View style={styles.contactBoxContent}>
                <View style={styles.iconContainer}>
                  <Ionicons name="call-outline" size={24} color="#4A90E2" />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactLabel}>Call us</Text>
                  <Text style={styles.contactSubLabel}>
                    Speak with Finny Team
                  </Text>
                  <Text style={styles.contactValue}>+1 213-354-3710</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#666"
                  style={styles.chevron}
                />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.responseText}>
            We typically respond immediately.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
  },
  modalContent: {
    backgroundColor: "#0F0F0F",
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
  },
  description: {
    fontSize: 16,
    color: "#888",
    lineHeight: 24,
    marginBottom: 24,
  },
  contactOptions: {
    gap: 16,
  },
  contactBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  contactBoxContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
    marginBottom: 4,
  },
  contactSubLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 6,
  },
  contactValue: {
    fontSize: 14,
    color: "#888",
  },
  chevron: {
    marginLeft: 8,
  },
  responseText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    marginTop: 24,
    fontStyle: "italic",
  },
});
