import type { HourlyForecastPoint, Units } from "@nimbus/shared";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { Panel } from "../../../components/Panel";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";
import { formatTemperature, formatTime } from "../../../utils/format";

type HourlyChartProps = {
  hourly: HourlyForecastPoint[];
  units: Units;
  /** The LOCATION's zone, not the device's. See `utils/format`. */
  timezone?: string | null;
};

export function HourlyChart({ hourly, units, timezone }: HourlyChartProps) {
  const theme = useAppTheme();
  const data = hourly.slice(0, 24);
  const width = Math.max(620, data.length * 58);
  const height = 190;
  const temperatures = data.map((point) => point.temperature);
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);
  const points = data.map((point, index) => {
    const x = 24 + index * ((width - 48) / Math.max(1, data.length - 1));
    const normalized = (point.temperature - min) / Math.max(1, max - min);
    const y = 118 - normalized * 74;
    return { x, y, point };
  });

  return (
    <Panel>
      <SectionHeader title="Next 24 hours" detail="Temperature, rain, wind, and UV trend" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} rx={8} fill={theme.colors.surfaceAlt} />
          <Polyline
            fill="none"
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            stroke={theme.colors.primary}
            strokeWidth={3}
          />
          {points.map(({ x, y, point }) => (
            <Circle key={point.time} cx={x} cy={y} r={4} fill={theme.colors.secondary} />
          ))}
          {points.map(({ x, point }) => (
            <SvgText key={`${point.time}-label`} x={x} y={154} fill={theme.colors.mutedText} fontSize={11} textAnchor="middle">
              {formatTime(point.time, timezone)}
            </SvgText>
          ))}
          {points.map(({ x, y, point }, index) => (
            index % 3 === 0 ? (
              <SvgText key={`${point.time}-temp`} x={x} y={y - 10} fill={theme.colors.text} fontSize={12} fontWeight="700" textAnchor="middle">
                {formatTemperature(point.temperature, units)}
              </SvgText>
            ) : null
          ))}
        </Svg>
      </ScrollView>
      {/* Hidden entirely when there is nothing to summarise. The legend reads
          `data[0]`, and `hourly` has no `.min()` on the schema, so an empty array
          is legal — and `?? 0` then printed "Rain 0% / Wind 0 km/h" from no data
          at all. Three readings of a chart with no points is the wrong answer
          whichever way the zeros are justified. */}
      {data.length > 0 && (
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: theme.colors.mutedText }]}>
            Rain {Math.round(data[0]!.precipitationProbability)}%
          </Text>
          {/* `windSpeed` is nullable, for the same reason as `uvIndex` below:
              `/forecast` omits the whole `wind` block in calm conditions, and
              `Math.round(null)` is 0 — so this legend claimed "Wind 0 km/h" from
              no measurement. The dash is the honest rendering. */}
          <Text style={[styles.legendText, { color: theme.colors.mutedText }]}>
            Wind{" "}
            {data[0]!.windSpeed == null ? "—" : `${Math.round(data[0]!.windSpeed)} km/h`}
          </Text>
          {/* `uvIndex` is nullable — `/forecast` carries no UV reading, so this
              printed "UV 0.0" on every live load. The `?? 0` re-introduced the
              exact fabricated measurement removed elsewhere. */}
          <Text style={[styles.legendText, { color: theme.colors.mutedText }]}>
            UV {data[0]!.uvIndex == null ? "—" : data[0]!.uvIndex.toFixed(1)}
          </Text>
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  legendText: {
    fontSize: 13,
    fontWeight: "700"
  }
});
