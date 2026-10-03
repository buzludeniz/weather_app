import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/useAppTheme";

type Option<T extends string> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              {
                backgroundColor: selected ? theme.colors.primary : "transparent",
                borderRadius: theme.radius.sm
              }
            ]}
          >
            <Text style={[styles.label, { color: selected ? "#FFFFFF" : theme.colors.text }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    padding: 4
  },
  label: {
    fontSize: 13,
    fontWeight: "700"
  },
  option: {
    alignItems: "center",
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 8
  }
});
