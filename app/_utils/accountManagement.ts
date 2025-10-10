// Account management utilities for Plaid account operations

const BASE_URL = process.env.EXPO_PUBLIC_APP_BASE_URL || "https://financify-rose.vercel.app";

export interface DeleteAccountResponse {
  success: boolean;
  message: string;
  deleted_account: {
    name: string;
    mask: string;
  };
  item_also_deleted: boolean;
  remaining_accounts: number;
}

export async function deleteAccount(
  accountId: string,
  userId: string
): Promise<DeleteAccountResponse> {
  const response = await fetch(`${BASE_URL}/api/plaid_management`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "remove_account",
      account_id: accountId,
      user_id: userId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete account");
  }

  return response.json();
}

