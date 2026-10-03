import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer, DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme } from "@react-navigation/native";
import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "../navigation/RootNavigator";
import { usePreferencesStore } from "../state/preferencesStore";
import { runStartupSync } from "../services/startupSync";
import { AppThemeContext } from "../theme/useAppTheme";
import { darkTheme, lightTheme } from "../theme/tokens";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      networkMode: "offlineFirst",
      retry: 2,
      staleTime: 1000 * 60 * 5
    }
  }
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  throttleTime: 1500
});

export function AppProvider() {
  const systemScheme = useColorScheme();
  const themePreference = usePreferencesStore((state) => state.preferences.theme);
  const resolvedMode = themePreference === "system" ? systemScheme ?? "light" : themePreference;
  const theme = resolvedMode === "dark" ? darkTheme : lightTheme;

  // Mirror the saved locations to the server once per launch so the alert
  // scanner knows which places to watch. Failures are handled inside.
  useEffect(() => {
    void runStartupSync();
  }, []);

  const navigationTheme = useMemo(() => {
    const base = theme.mode === "dark" ? NavigationDarkTheme : NavigationLightTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.colors.background,
        border: theme.colors.border,
        card: theme.colors.surface,
        primary: theme.colors.primary,
        text: theme.colors.text
      }
    };
  }, [theme]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeContext.Provider value={theme}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24 }}
          >
            <NavigationContainer theme={navigationTheme}>
              <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
              <RootNavigator />
            </NavigationContainer>
          </PersistQueryClientProvider>
        </AppThemeContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
