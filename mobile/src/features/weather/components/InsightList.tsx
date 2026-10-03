import { Ionicons } from "@expo/vector-icons";
import type { Insight } from "@nimbus/shared";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";

type InsightListProps = {
  insights: Insight[];
};

export function InsightList({ insights }: InsightListProps) {
  const theme = useAppTheme();

  return (
    <Panel>
      <SectionHeader title="Weather intelligence" detail="Useful changes and timing" />
      {insights.map((insight) => (
        <View key={insight.id} style={styles.row}>
          <Ionicons name="sparkles-outline" color={theme.colors.secondary} size={20} />
          <View style={styles.copy}>
            <Text style={[styles.message, { color: theme.colors.text }]}>{insight.message}</Text>
            <Text style={[styles.evidence, { color: theme.colors.mutedText }]} numberOfLines={2}>
              {insight.evidence.join(" · ")}
            </Text>
          </View>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    gap: 3
  },
  evidence: {
    fontSize: 12
  },
  message: {
    fontSize: 15,
    fontWeight: "700"
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  }
});
