// types/addGoalModalTypes.ts

export interface GoalInput {
    label: string;
    target: number;
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
  