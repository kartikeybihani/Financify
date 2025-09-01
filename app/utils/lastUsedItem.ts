// app/utils/lastUsedItem.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_USED_KEY = "last_used_item_id";

export async function setLastUsedItemId(itemId: string) {
  await AsyncStorage.setItem(LAST_USED_KEY, itemId);
}

export async function getLastUsedItemId(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_USED_KEY);
}

export async function clearLastUsedItemId() {
  await AsyncStorage.removeItem(LAST_USED_KEY);
}
