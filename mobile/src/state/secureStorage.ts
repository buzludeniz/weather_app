import * as SecureStore from "expo-secure-store";
import type { StateStorage } from "zustand/middleware";

export const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value)
};
