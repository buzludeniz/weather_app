import { Switch, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/useAppTheme";

type ToggleRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onChange: () => void;
};

export function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.row}>
      <View style={styles.textGroup}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.description, { color: theme.colors.mutedText }]}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={value ? theme.colors.primary : theme.colors.mutedText}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  description: {
    fontSize: 13,
    lineHeight: 18
  },
  label: {
    fontSize: 15,
    fontWeight: "700"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    minHeight: 54
  },
  textGroup: {
    flex: 1,
    gap: 3
  }
});
