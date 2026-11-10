import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { AppThemeContext } from "../theme/useAppTheme";
import { lightTheme } from "../theme/tokens";

// React Query batches its re-renders on a timer, which lands outside act().
// Route them through act() so screen tests see settled state without warnings.
notifyManager.setNotifyFunction((callback) => {
  act(callback);
});

/** Render with the providers every screen expects: theme and React Query. */
export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } }
  });
  return render(
    <QueryClientProvider client={client}>
      <AppThemeContext.Provider value={lightTheme}>{ui}</AppThemeContext.Provider>
    </QueryClientProvider>
  );
}
