import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Token storage with a per-platform backend: Keychain/Keystore via
 * expo-secure-store on iOS/Android; localStorage on web, where the SDK's
 * SecureStore web build is native-module-shaped and its methods are
 * unavailable in the browser bundle.
 */
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
