import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const CONVERSATION_STARTERS = [
  "What's the best way to start saving for retirement?",
  "How can I create a budget that actually works?",
  "What's the difference between good debt and bad debt?",
  "How much should I have in my emergency fund?",
  "What are some passive income strategies?",
  "How can I improve my credit score?",
  "Should I invest in stocks or mutual funds?",
  "How can I reduce my monthly expenses?",
  "What's the best way to pay off credit card debt?",
  "How should I prioritize my financial goals?",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectQuestion: (question: string) => void;
}

const ConversationStartersModal = ({
  visible,
  onClose,
  onSelectQuestion,
}: Props) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <LinearGradient
          colors={["#2A2A2A", "#1A1A1A", "#0A0A0A"]}
          style={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Conversation Starters</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          <View style={styles.questionsContainer}>
            <ScrollView style={styles.questionsList}>
              {CONVERSATION_STARTERS.map((question, index) => (
                <TouchableOpacity
                  onPress={() => {
                    onSelectQuestion(question);
                    onClose();
                  }}
                >
                  <View key={index} style={styles.questionRow}>
                    <Text style={styles.questionText}>{question}</Text>
                    <View style={styles.arrowContainer}>
                      <Ionicons
                        name="arrow-up-circle-outline"
                        size={32}
                        color="#ccc"
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    height: "85%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  questionsContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    marginHorizontal: 8,
    marginTop: 12,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  closeButton: {
    padding: 4,
  },
  questionsList: {
    paddingHorizontal: 0,
    paddingTop: 0,
    flex: 1,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
    marginRight: 12,
    lineHeight: 20,
  },
  // sendButton: {
  //   width: 32,
  //   height: 32,
  //   borderRadius: 16,
  //   justifyContent: "center",
  //   alignItems: "center",
  // },
  arrowContainer: {
    // width: 32,
    // height: 32,
    // // borderRadius: 16,
    // // justifyContent: "center",
    // // alignItems: "center",
  },
});

export default ConversationStartersModal;
