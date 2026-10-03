import type { DailyForecastPoint, Units } from "@nimbus/shared";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";
import { conditionIcon, formatDay, formatTemperature, formatTime } from "../../../utils/format";

type DailyForecastListProps = {
  daily: DailyForecastPoint[];
  units: Units;
  /** The LOCATION's zone, not the device's. See `utils/format`. */
  timezone?: string | null;
};

/**
 * Does this row state a daily range, or is the absence of one being reported?
 *
 * Mirrors `rangeKnown` in `frontend/app.js`. The two clients must not disagree
 * about the same row, and they DID: this function was gated only on
 * `high !== low`, while the web's is gated on `!partial` too. Measured live across
 * 24 hours, today's row is `partial` for ~75% of the day, and for 18 of those 24
 * hours the phone printed a partial day's high and low in the temperature slots
 * while the web dashed both. The words "partial range" appeared in the caption, so
 * it was disclosed in text -- but the number still sat in the position that IS the
 * claim, which is the defect.
 *
 * The comment here previously argued the opposite: "not gated on `partial`, because
 * a zero-width range is impossible in nature and so is untrustworthy whatever the
 * provider claims". That reasoning is sound for the DEGENERATE check and was never
 * an argument about `partial` at all. It is the same non-sequitur the web side had,
 * which is how two clients drifted apart while a comment on each of them claimed
 * they mirrored one another.
 */
function hasRange(day: DailyForecastPoint): boolean {
  return day.high != null && day.low != null && day.high !== day.low && !day.partial;
}

export function DailyForecastList({ daily, units, timezone }: DailyForecastListProps) {
  const theme = useAppTheme();

  return (
    <Panel>
      {/* Derived, like the web's. A hardcoded "14 day forecast" claimed a range
          the provider never sent: the 5-day endpoint returns 5-6 rows (verified
          live — Longyearbyen 6, Singapore 5) and the schema is `.max(14)`, not
          `.length(14)`. */}
      <SectionHeader
        title={`${daily.length} day forecast`}
        detail="Highs, lows, sun, moon, and AQI"
      />
      {daily.map((day) => (
        <View key={day.date} style={[styles.row, { borderColor: theme.colors.border }]}>
          <View style={styles.dayGroup}>
            <Text style={[styles.day, { color: theme.colors.text }]}>{formatDay(day.date, timezone)}</Text>
            <Text style={[styles.detail, { color: theme.colors.mutedText }]}>
              {/* `airQuality` is optional: the 5-day forecast endpoint carries no
                  air-quality data at all, so reading it unconditionally threw
                  `Cannot read properties of undefined` on every live bundle.
                  Render the AQI only when it is actually present. */}
              {day.airQuality ? `AQI ${day.airQuality.aqi} · ` : ""}
              Moon {day.moonPhase.replace(/_/g, " ")}
              {/* `partial` means these high/low figures are NOT a full day's
                  range. OWM's 3-hourly list starts at the present, so "today"
                  holds only the buckets left before local midnight — one at
                  22:24 — and aggregating one temperature makes the high and low
                  equal. The web client says so; without this, a mobile reader
                  got the same soft numbers with no disclosure at all. */}
              {day.partial ? " · partial range" : ""}
            </Text>
          </View>
          <Ionicons name={conditionIcon(day.condition)} size={22} color={theme.colors.accent} />
          <View style={styles.tempGroup}>
            {/* The web client renders a dash for a degenerate range and so must
                this one, or the two disagree about the same row. `high === low`
                is not a narrow day; it is a day whose range is unknown, because
                the slots that produced it do not cover one. */}
            <Text style={[styles.temp, { color: theme.colors.text }]}>
              {hasRange(day) ? formatTemperature(day.high, units) : "—"}
            </Text>
            <Text style={[styles.detail, { color: theme.colors.mutedText }]}>
              {hasRange(day) ? formatTemperature(day.low, units) : "—"}
            </Text>
          </View>
          {/* Both nullable: above the Arctic circle the sun does not rise or set
              for weeks. `formatTime` was called unguarded on both. */}
          <Text style={[styles.detail, { color: theme.colors.mutedText }]}>
            {day.sunrise ? formatTime(day.sunrise, timezone) : "—"} / {day.sunset ? formatTime(day.sunset, timezone) : "—"}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  day: {
    fontSize: 15,
    fontWeight: "800"
  },
  dayGroup: {
    flex: 1,
    gap: 2
  },
  detail: {
    fontSize: 12
  },
  row: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingTop: 10
  },
  temp: {
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right"
  },
  tempGroup: {
    minWidth: 54
  }
});
