import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DefaultUserPreferences, type ThemePreference, type Units, type UserPreferences } from "@nimbus/shared";
import { secureStorage } from "./secureStorage";

type PreferencesState = {
  preferences: UserPreferences;
  setUnits: (units: Units) => void;
  setTheme: (theme: ThemePreference) => void;
  toggleNotification: (key: keyof UserPreferences["notifications"]) => void;
  togglePrivacy: (key: keyof UserPreferences["privacy"]) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      preferences: DefaultUserPreferences,
      setUnits: (units) => set((state) => ({ preferences: { ...state.preferences, units } })),
      setTheme: (theme) => set((state) => ({ preferences: { ...state.preferences, theme } })),
      toggleNotification: (key) => set((state) => ({
        preferences: {
          ...state.preferences,
          notifications: {
            ...state.preferences.notifications,
            [key]: typeof state.preferences.notifications[key] === "boolean"
              ? !state.preferences.notifications[key]
              : state.preferences.notifications[key]
          }
        }
      })),
      togglePrivacy: (key) => set((state) => ({
        preferences: {
          ...state.preferences,
          privacy: {
            ...state.preferences.privacy,
            [key]: !state.preferences.privacy[key]
          }
        }
      }))
    }),
    {
      name: "nimbus-preferences",
      storage: createJSONStorage(() => secureStorage)
    }
  )
);
