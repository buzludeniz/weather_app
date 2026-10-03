import { Ionicons } from "@expo/vector-icons";
import type { CurrentWeather, LocationResult, Units } from "@nimbus/shared";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { useAppTheme } from "../../../theme/useAppTheme";
import { conditionIcon, formatSpeed, formatTemperature } from "../../../utils/format";

type CurrentWeatherHeroProps = {
  current: CurrentWeather;
  location: LocationResult;
  units: Units;
};

export function CurrentWeatherHero({ current, location, units }: CurrentWeatherHeroProps) {
  const theme = useAppTheme();

  return (
    <Panel tone="alt">
      <View style={styles.topRow}>
        <View style={styles.locationGroup}>
          <Text style={[styles.location, { color: theme.colors.text }]}>{location.name}</Text>
          <Text style={[styles.detail, { color: theme.colors.mutedText }]}>{location.country}</Text>
        </View>
        <Ionicons name={conditionIcon(current.condition)} size={42} color={theme.colors.accent} />
      </View>
      <Text style={[styles.temperature, { color: theme.colors.text }]}>{formatTemperature(current.temperature, units)}</Text>
      <Text style={[styles.condition, { color: theme.colors.mutedText }]}>
        {current.conditionText} · Feels like {formatTemperature(current.feelsLike, units)}
      </Text>
      <View style={styles.metricRow}>
        <Text style={[styles.metric, { color: theme.colors.text }]}>Humidity {current.humidity}%</Text>
        {/* `windSpeed` is nullable — OWM omits the whole `wind` block in calm
            conditions. `formatSpeed(null)` is what, exactly? Guard it the same
            way the UV reading beside it is guarded. */}
        <Text style={[styles.metric, { color: theme.colors.text }]}>
          Wind {current.windSpeed == null ? "—" : formatSpeed(current.windSpeed, units)}
        </Text>
        <Text style={[styles.metric, { color: theme.colors.text }]}>
          UV {current.uvIndex == null ? "—" : current.uvIndex.toFixed(1)}
        </Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  condition: {
    fontSize: 16
  },
  detail: {
    fontSize: 14
  },
  location: {
    fontSize: 24,
    fontWeight: "800"
  },
  locationGroup: {
    flex: 1,
    gap: 2
  },
  metric: {
    fontSize: 13,
    fontWeight: "700"
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  temperature: {
    fontSize: 64,
    fontWeight: "800",
    letterSpacing: 0
  },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  }
});
