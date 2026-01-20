let recoveryInProgress = false;

export const setRecoveryInProgress = (value: boolean) => {
  recoveryInProgress = value;
};

export const isRecoveryInProgress = () => recoveryInProgress;
