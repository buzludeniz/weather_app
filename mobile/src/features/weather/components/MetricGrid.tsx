import type { CurrentWeather, Units } from "@nimbus/shared";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";
import { formatSpeed } from "../../../utils/format";

type MetricGridProps = {
  current: CurrentWeather;
  units: Units;
};

export function MetricGrid({ current, units }: MetricGridProps) {
  const theme = useAppTheme();
  const metrics = [
    // `pressure` was `?? 0` and `visibility` `?? 10000` in the mapper. A zero
    // pressure cannot satisfy the contract's `.positive()`, and "10 km" is the
    // most reassuring visibility there is — both invented from an absent reading.
    ["Pressure", current.pressure == null ? "—" : `${Math.round(current.pressure)} hPa`],
    ["Visibility", current.visibility == null ? "—" : `${current.visibility.toFixed(1)} km`],
    // `dewPoint` and `windGust` are nullable: OpenWeatherMap's free tier reports
    // neither, and a hardcoded 0 printed "Dew point 0 C" and "Gusts 0 km/h" as
    // measurements. Absence is an em dash, not a zero.
    ["Dew point", current.dewPoint == null ? "—" : `${Math.round(current.dewPoint)} C`],
    ["Gusts", current.windGust == null ? "—" : formatSpeed(current.windGust, units)],
    // `windDirection` is nullable for the same reason: OWM omits the whole `wind`
    // block in calm conditions, and `?? 0` rendered as due north — a compass
    // reading for a measurement that does not exist.
    ["Direction", current.windDirection == null ? "—" : `${Math.round(current.windDirection)} deg`],
    // Was `${current.cloudCoverage}%` with no guard, so an absent reading printed
    // the four characters `null%`. The four lines above it were all guarded in the
    // same edit; this one was missed. `tsc` cannot catch it either — a template
    // literal accepts `null` without complaint, so the type gate is blind here.
    // `== null`, not truthiness: a genuine 0 % cloud cover must still read `0%`.
    ["Clouds", current.cloudCoverage == null ? "—" : `${current.cloudCoverage}%`]
  ];

  return (
    <Panel>
      <SectionHeader title="Current details" />
      <View style={styles.grid}>
        {metrics.map(([label, value]) => (
          <View key={label} style={[styles.tile, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[styles.label, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  label: {
    fontSize: 12
  },
  tile: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: "31%",
    flexGrow: 1,
    minHeight: 72,
    padding: 10
  },
  value: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 6
  }
});
