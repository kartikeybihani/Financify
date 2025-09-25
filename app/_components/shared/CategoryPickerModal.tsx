import * as React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getCategoryOptions,
  GoalCategory,
} from "../../../src/utils/goalCategories";

interface CategoryPickerModalProps {
  visible: boolean;
  selectedCategory: GoalCategory;
  onSelect: (category: GoalCategory) => void;
  onClose: () => void;
}

export default function CategoryPickerModal({
  visible,
  selectedCategory,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  const categoryOptions = getCategoryOptions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.content}>
              <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.grid}>
                  {categoryOptions.map((category) => (
                    <TouchableOpacity
                      key={category.value}
                      style={[
                        styles.box,
                        selectedCategory === category.value &&
                          styles.boxSelected,
                        {
                          backgroundColor: category.backgroundColor,
                          borderColor:
                            selectedCategory === category.value
                              ? category.color
                              : category.color + "40",
                          borderWidth:
                            selectedCategory === category.value ? 2 : 1,
                        },
                      ]}
                      onPress={() => {
                        onSelect(category.value);
                        onClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.emoji}>{category.emoji}</Text>
                      <Text
                        style={[
                          styles.text,
                          {
                            color:
                              selectedCategory === category.value
                                ? category.color
                                : "#333",
                            fontWeight:
                              selectedCategory === category.value
                                ? "700"
                                : "600",
                          },
                        ]}
                      >
                        {category.label}
                      </Text>
                      {selectedCategory === category.value && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={category.color}
                          style={styles.checkmark}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  list: {
    maxHeight: 400,
    marginBottom: 25,
    marginTop: 10,
    marginHorizontal: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  box: {
    borderRadius: 24,
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
    maxWidth: 200,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 2,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  boxSelected: {
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  emoji: {
    fontSize: 20,
    marginRight: 6,
    textAlign: "center",
    minWidth: 20,
  },
  text: {
    fontWeight: "600",
    fontSize: 13,
    color: "#333",
    textAlign: "center",
    flexShrink: 1,
    flexGrow: 0,
  },
  checkmark: {
    marginLeft: 6,
    opacity: 0.9,
  },
});
