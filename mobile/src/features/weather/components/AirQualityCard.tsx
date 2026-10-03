import type { AirQuality } from "@nimbus/shared";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";

type AirQualityCardProps = {
  /* Optional: `/air_pollution` is metered separately from the weather endpoints
   * and fails independently. The old fallback fabricated
   * `{ aqi: 0, category: "good" }`, which this card rendered as a confident
   * green "0 — Good". Absence now reaches here as `undefined`. */
  airQuality: AirQuality | undefined;
};

export function AirQualityCard({ airQuality }: AirQualityCardProps) {
  const theme = useAppTheme();

  if (!airQuality) {
    return (
      <Panel>
        <SectionHeader title="Air quality" detail="No air quality data" />
      </Panel>
    );
  }

  /* Annotated, because the inferred element type of a mixed label/value tuple
   * array widens the value to `string | number` and `value.toFixed` stops
   * type-checking. */
  const pollutants: [string, number | null][] = [
    ["PM2.5", airQuality.pm25],
    ["PM10", airQuality.pm10],
    ["O3", airQuality.ozone],
    ["CO", airQuality.carbonMonoxide],
    ["NO2", airQuality.nitrogenDioxide],
    ["SO2", airQuality.sulfurDioxide]
  ];

  return (
    <Panel>
      <SectionHeader title="Air quality" detail={airQuality.recommendation} />
      <View style={styles.summary}>
        <Text style={[styles.aqi, { color: theme.colors.text }]}>{airQuality.aqi}</Text>
        <Text style={[styles.category, { color: theme.colors.primary }]}>{airQuality.category.replace(/_/g, " ")}</Text>
      </View>
      <View style={styles.pollutants}>
        {pollutants.map(([label, value]) => (
          <View key={label} style={[styles.pollutant, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[styles.pollutantLabel, { color: theme.colors.mutedText }]}>{label}</Text>
            {/* All six components are nullable: they were `?? 0` in the mapper,
                so a payload with no `components` block showed every pollutant
                measured at exactly 0.0. `Number(null)` is 0, so this needed a
                real null check — the coercion is what hid the absence. */}
            <Text style={[styles.pollutantValue, { color: theme.colors.text }]}>
              {value == null ? "—" : value.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  aqi: {
    fontSize: 46,
    fontWeight: "800"
  },
  category: {
    fontSize: 16,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  pollutant: {
    borderRadius: 8,
    minWidth: "30%",
    padding: 10
  },
  pollutantLabel: {
    fontSize: 12
  },
  pollutantValue: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4
  },
  pollutants: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summary: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 12
  }
});
