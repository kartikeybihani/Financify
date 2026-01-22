// app/utils/lastUsedItem.ts
import AppStorage from "@/src/utils/storage/storage";

const LAST_USED_KEY = "last_used_item_id";

export async function setLastUsedItemId(itemId: string) {
  AppStorage.setItemSync(LAST_USED_KEY, itemId);
}

export async function getLastUsedItemId(): Promise<string | null> {
  return Promise.resolve(AppStorage.getItemSync(LAST_USED_KEY));
}

export async function clearLastUsedItemId() {
  AppStorage.removeItemSync(LAST_USED_KEY);
}
