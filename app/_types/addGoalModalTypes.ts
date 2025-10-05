// types/addGoalModalTypes.ts
import { GoalCategory } from '@/src/utils/goalCategories';

export interface GoalInput {
    label: string;
    note?: string;
    target_amount: number;
    current_amount?: number;
    target_date: string; // ISO date string
    category: GoalCategory;
}
  
export interface AddGoalModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (goal: GoalInput) => void;
}

const types = {
    GoalInput: {} as GoalInput,
    AddGoalModalProps: {} as AddGoalModalProps
};

export default types;
  