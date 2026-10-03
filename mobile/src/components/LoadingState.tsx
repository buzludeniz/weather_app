import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/useAppTheme";

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading weather" }: LoadingStateProps) {
  const theme = useAppTheme();
  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.colors.primary} />
      <Text style={[styles.label, { color: theme.colors.mutedText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
    minHeight: 220
  },
  label: {
    fontSize: 14
  }
});
