import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/useAppTheme";

type SectionHeaderProps = {
  title: string;
  detail?: string;
};

export function SectionHeader({ title, detail }: SectionHeaderProps) {
  const theme = useAppTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {detail ? <Text style={[styles.detail, { color: theme.colors.mutedText }]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2
  },
  detail: {
    fontSize: 13
  },
  title: {
    fontSize: 18,
    fontWeight: "700"
  }
});
