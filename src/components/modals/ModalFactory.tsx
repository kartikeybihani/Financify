// components/modals/ModalFactory.tsx

import React, { ComponentType } from "react";
import CategorySelectionModal from "./CategorySelectionModal";
import CashDepositInstitutionModal from "./CashDepositInstitutionModal";
import CreditCardInstitutionModal from "./CreditCardInstitutionModal";
import InstitutionSelectionModal from "./InstitutionSelectionModal";
import AccountDetailModal from "./AccountDetailModal";
import CashInputModal from "./CashInputModal";

// Modal registry - no lazy loading for simple UI modals
const modalRegistry = {
  categorySelection: CategorySelectionModal,
  cashDeposit: CashDepositInstitutionModal,
  creditCard: CreditCardInstitutionModal,
  investment: InstitutionSelectionModal,
  accountDetail: AccountDetailModal,
  cashInput: CashInputModal,
  accounts: null, // This will be handled by FinancialBottomSheet
} as const;

export type ModalType = keyof typeof modalRegistry;

interface ModalFactoryProps {
  modalType: ModalType | null;
  modalProps: any;
  onClose: () => void;
}

export const ModalFactory: React.FC<ModalFactoryProps> = ({
  modalType,
  modalProps,
  onClose,
}) => {
  if (!modalType || modalType === "accounts") return null;

  const ModalComponent = modalRegistry[modalType] as ComponentType<any>;

  return <ModalComponent {...modalProps} onClose={onClose} />;
};

// Hook for managing modal state
export const useModalManager = () => {
  const [activeModal, setActiveModal] = React.useState<ModalType | null>(null);
  const [modalProps, setModalProps] = React.useState<any>({});

  const openModal = (type: ModalType, props: any = {}) => {
    console.log("Opening modal:", type, props);
    setActiveModal(type);
    setModalProps(props);
  };

  const closeModal = () => {
    console.log("Closing modal");
    setActiveModal(null);
    setModalProps({});
  };

  return {
    activeModal,
    modalProps,
    openModal,
    closeModal,
  };
};
