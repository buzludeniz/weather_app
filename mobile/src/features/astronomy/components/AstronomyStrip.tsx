import type { Astronomy } from "@nimbus/shared";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";
import { formatTime } from "../../../utils/format";

type AstronomyStripProps = {
  astronomy: Astronomy;
  /** The LOCATION's zone, not the device's. See `utils/format`. */
  timezone?: string | null;
};

export function AstronomyStrip({ astronomy, timezone }: AstronomyStripProps) {
  const theme = useAppTheme();
  /* The moon frequently neither rises nor sets on a given day, and a twilight
   * band can be absent at high latitude, so all four of these are nullable. A
   * dash is the honest rendering; the previous solar-noon substitute made
   * Longyearbyen show "Moonrise 12:47 / Moonset 12:47" as though measured. */
  const at = (iso: string | null) => (iso ? formatTime(iso, timezone) : "—");
  const items = [
    // Sunrise and sunset route through `at()` too: above the Arctic circle the
    // sun does neither for weeks at a time, and the old solar-noon substitute
    // printed "Sunrise 12:55 / Sunset 12:55" as though measured.
    ["Sunrise", at(astronomy.sunrise)],
    ["Sunset", at(astronomy.sunset)],
    ["Moonrise", at(astronomy.moonrise)],
    ["Moonset", at(astronomy.moonset)],
    ["Golden", at(astronomy.goldenHourEvening)],
    ["Blue", at(astronomy.blueHourEvening)]
  ];

  return (
    <Panel>
      <SectionHeader title="Astronomy" detail={`Moon phase: ${astronomy.moonPhase.replace(/_/g, " ")}`} />
      <View style={styles.grid}>
        {items.map(([label, value]) => (
          <View key={label} style={[styles.item, { backgroundColor: theme.colors.surfaceAlt }]}>
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
  item: {
    borderRadius: 8,
    flexBasis: "31%",
    flexGrow: 1,
    padding: 10
  },
  label: {
    fontSize: 12
  },
  value: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4
  }
});
