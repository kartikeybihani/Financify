import React from "react";
import { Modal, View, Text, TouchableOpacity, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "@/app/_styles/insightsStyles";

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  formatCategoryName: (category: string) => string;
}

const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  categories,
  selectedCategory,
  onSelectCategory,
  formatCategoryName,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filter by Category</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={categories}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.filterItem,
                  selectedCategory === item && styles.selectedFilterItem,
                ]}
                onPress={() => {
                  onSelectCategory(item);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.filterItemText,
                    selectedCategory === item && styles.selectedFilterItemText,
                  ]}
                >
                  {formatCategoryName(item)}
                </Text>
                {selectedCategory === item && (
                  <Ionicons name="checkmark" size={20} color="#4A90E2" />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

export default FilterModal;
