import { Ionicons } from "@expo/vector-icons";
import type { LocationResult, Units } from "@nimbus/shared";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../theme/useAppTheme";
import { formatTemperature } from "../../../utils/format";
import { useWeatherBundle } from "../../weather/hooks/useWeather";

type IconName = ComponentProps<typeof Ionicons>["name"];

type SavedLocationRowProps = {
  location: LocationResult;
  units: Units;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
};

export function locationSubtitle(location: LocationResult): string {
  return [location.region, location.country].filter((part) => part != null && part !== "").join(", ");
}

/**
 * The current reading for one saved place, or a plain statement of why there
 * is none. While loading or after a failure it shows no number at all.
 */
function CurrentReading({ location, units }: { location: LocationResult; units: Units }) {
  const theme = useAppTheme();
  const weather = useWeatherBundle(location);

  if (weather.data == null) {
    return (
      <Text style={[styles.reading, { color: theme.colors.mutedText }]}>
        {weather.isError ? "Weather unavailable" : "Loading…"}
      </Text>
    );
  }

  const { current, source } = weather.data;
  return (
    <View style={styles.readingGroup}>
      <Text style={[styles.temperature, { color: theme.colors.text }]}>{formatTemperature(current.temperature, units)}</Text>
      <Text style={[styles.reading, { color: theme.colors.mutedText }]} numberOfLines={1}>{current.conditionText}</Text>
      {source === "sample" ? (
        <Text style={[styles.sample, { color: theme.colors.warning }]}>Sample data</Text>
      ) : null}
    </View>
  );
}

function RowAction({ icon, label, onPress, disabled = false, color }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={[styles.action, { opacity: disabled ? 0.3 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

export function SavedLocationRow(props: SavedLocationRowProps) {
  const { location, units, isSelected, isFirst, isLast, onOpen, onToggleFavorite, onMove, onRemove } = props;
  const theme = useAppTheme();
  const subtitle = locationSubtitle(location);

  return (
    <View style={[styles.row, { borderColor: theme.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show weather for ${location.name}`}
        accessibilityState={{ selected: isSelected }}
        onPress={onOpen}
        style={styles.main}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>{location.name}</Text>
          {isSelected ? <Text style={[styles.badge, { color: theme.colors.primary }]}>Showing</Text> : null}
        </View>
        {subtitle === "" ? null : (
          <Text style={[styles.subtitle, { color: theme.colors.mutedText }]} numberOfLines={1}>{subtitle}</Text>
        )}
        <CurrentReading location={location} units={units} />
      </Pressable>
      <View style={styles.actions}>
        <RowAction
          icon={location.isFavorite ? "star" : "star-outline"}
          label={location.isFavorite ? `Remove ${location.name} from favourites` : `Add ${location.name} to favourites`}
          onPress={onToggleFavorite}
          color={location.isFavorite ? theme.colors.accentWarm : theme.colors.mutedText}
        />
        <RowAction icon="chevron-up" label={`Move ${location.name} up`} onPress={() => onMove(-1)} disabled={isFirst} color={theme.colors.text} />
        <RowAction icon="chevron-down" label={`Move ${location.name} down`} onPress={() => onMove(1)} disabled={isLast} color={theme.colors.text} />
        <RowAction icon="trash-outline" label={`Remove ${location.name}`} onPress={onRemove} color={theme.colors.danger} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32
  },
  actions: {
    alignItems: "center",
    flexDirection: "row"
  },
  badge: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  main: {
    flex: 1,
    gap: 2
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700"
  },
  reading: {
    flexShrink: 1,
    fontSize: 13
  },
  readingGroup: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8
  },
  row: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12
  },
  sample: {
    fontSize: 11,
    fontWeight: "700"
  },
  subtitle: {
    fontSize: 13
  },
  temperature: {
    fontSize: 15,
    fontWeight: "700"
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  }
});
