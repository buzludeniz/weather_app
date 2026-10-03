import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useAppTheme } from "../theme/useAppTheme";

type PanelProps = {
  children: ReactNode;
  tone?: "default" | "alt";
};

export function Panel({ children, tone = "default" }: PanelProps) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: tone === "alt" ? theme.colors.surfaceAlt : theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.lg
        }
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12
  }
});
