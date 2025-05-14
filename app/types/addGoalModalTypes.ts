// types/addGoalModalTypes.ts

export interface GoalInput {
    label: string;
    description: string;
    progress?: number;
    timeline: {
        month: string;
        year: number;
    };
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
  