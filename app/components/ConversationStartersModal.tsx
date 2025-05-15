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
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Conversation Starters</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.questionsList}>
            {CONVERSATION_STARTERS.map((question, index) => (
              <View key={index} style={styles.questionRow}>
                <Text style={styles.questionText}>{question}</Text>
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={() => {
                    onSelectQuestion(question);
                    onClose();
                  }}
                >
                  <Ionicons
                    name="arrow-up-circle-sharp"
                    size={32}
                    color="white"
                  />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
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
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
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
    paddingHorizontal: 20,
    paddingTop: 12,
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
  sendButton: {
    // backgroundColor: "#4A90E2",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ConversationStartersModal;
