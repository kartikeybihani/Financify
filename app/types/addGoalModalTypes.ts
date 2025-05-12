// types/addGoalModalTypes.ts

export interface GoalInput {
    year: string;
    label: string;
    description: string;
    progress?: number;
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
  