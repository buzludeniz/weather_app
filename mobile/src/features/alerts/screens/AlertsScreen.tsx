import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { LoadingState } from "../../../components/LoadingState";
import { Panel } from "../../../components/Panel";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { useLocationStore } from "../../../state/locationStore";
import { useAppTheme } from "../../../theme/useAppTheme";
import { formatTime } from "../../../utils/format";
import { useWeatherBundle } from "../../weather/hooks/useWeather";

export function AlertsScreen() {
  const theme = useAppTheme();
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const weather = useWeatherBundle(selectedLocation);

  if (weather.isLoading && !weather.data) {
    return <Screen><LoadingState label="Checking alerts" /></Screen>;
  }

  const alerts = weather.data?.alerts ?? [];

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Severe weather alerts" detail={selectedLocation.name} />
        {alerts.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={34} color={theme.colors.success} />
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>No active alerts</Text>
            <Text style={[styles.detail, { color: theme.colors.mutedText }]}>Storm, flood, heat, wind, and snow alerts will appear here.</Text>
          </View>
        ) : alerts.map((alert) => (
          <View key={alert.id} style={[styles.alert, { borderColor: theme.colors.border }]}>
            <Ionicons name="warning-outline" size={24} color={theme.colors.warning} />
            <View style={styles.alertCopy}>
              <Text style={[styles.alertTitle, { color: theme.colors.text }]}>{alert.title}</Text>
              <Text style={[styles.detail, { color: theme.colors.mutedText }]}>{alert.description}</Text>
              <Text style={[styles.detail, { color: theme.colors.mutedText }]}>
                {alert.severity} · {formatTime(alert.startsAt)} to {formatTime(alert.endsAt)}
              </Text>
            </View>
          </View>
        ))}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: {
    alignItems: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingTop: 12
  },
  alertCopy: {
    flex: 1,
    gap: 4
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: "800"
  },
  detail: {
    fontSize: 13,
    lineHeight: 18
  },
  empty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 28
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "800"
  }
});
