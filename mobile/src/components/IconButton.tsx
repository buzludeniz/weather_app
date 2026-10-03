import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useAppTheme } from "../theme/useAppTheme";

type IconName = ComponentProps<typeof Ionicons>["name"];

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "neutral";
};

export function IconButton({ icon, label, onPress, tone = "neutral" }: IconButtonProps) {
  const theme = useAppTheme();
  const color = tone === "primary" ? theme.colors.primary : tone === "secondary" ? theme.colors.secondary : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.surface,
          borderColor: color,
          opacity: pressed ? 0.72 : 1
        }
      ]}
    >
      <Ionicons name={icon} color={color} size={18} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12
  },
  label: {
    fontSize: 14,
    fontWeight: "700"
  }
});
