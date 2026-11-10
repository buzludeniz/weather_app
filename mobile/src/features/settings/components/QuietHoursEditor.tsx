import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../theme/useAppTheme";
import { shiftHour } from "../../../utils/time";

type QuietHoursEditorProps = {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
};

function Stepper({ label, value, onShift }: { label: string; value: string; onShift: (hours: number) => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.stepper}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} one hour earlier`} hitSlop={6} onPress={() => onShift(-1)}>
        <Ionicons name="remove-circle-outline" size={24} color={theme.colors.primary} />
      </Pressable>
      <Text style={[styles.value, { color: theme.colors.text }]} accessibilityLabel={`${label} ${value}`}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} one hour later`} hitSlop={6} onPress={() => onShift(1)}>
        <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

export function QuietHoursEditor({ start, end, onChange }: QuietHoursEditorProps) {
  const theme = useAppTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Quiet hours</Text>
      <Text style={[styles.description, { color: theme.colors.mutedText }]}>
        Minor and moderate alerts are not sent between these times. Severe and extreme alerts always are.
      </Text>
      <Stepper label="Starts" value={start} onShift={(hours) => onChange(shiftHour(start, hours), end)} />
      <Stepper label="Ends" value={end} onShift={(hours) => onChange(start, shiftHour(end, hours))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  description: {
    fontSize: 13,
    lineHeight: 18
  },
  label: {
    flex: 1,
    fontSize: 15
  },
  stepper: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  title: {
    fontSize: 15,
    fontWeight: "700"
  },
  value: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    minWidth: 52,
    textAlign: "center"
  }
});
