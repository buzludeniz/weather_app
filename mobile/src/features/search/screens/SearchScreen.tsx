import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { LocationResult } from "@nimbus/shared";
import { LoadingState } from "../../../components/LoadingState";
import { Panel } from "../../../components/Panel";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { useLocationStore } from "../../../state/locationStore";
import { useAppTheme } from "../../../theme/useAppTheme";
import { useLocationSearch } from "../hooks";

function LocationRow({ location, onPress }: { location: LocationResult; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1, borderColor: theme.colors.border }]}
    >
      <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
      <View style={styles.locationCopy}>
        <Text style={[styles.locationName, { color: theme.colors.text }]}>{location.name}</Text>
        <Text style={[styles.locationDetail, { color: theme.colors.mutedText }]}>
          {[location.region, location.country].filter(Boolean).join(", ")}
        </Text>
      </View>
    </Pressable>
  );
}

export function SearchScreen() {
  const theme = useAppTheme();
  const [query, setQuery] = useState("");
  const results = useLocationSearch(query);
  const recentSearches = useLocationStore((state) => state.recentSearches);
  const savedLocations = useLocationStore((state) => state.savedLocations);
  const setSelectedLocation = useLocationStore((state) => state.setSelectedLocation);
  const saveLocation = useLocationStore((state) => state.saveLocation);

  function selectLocation(location: LocationResult) {
    setSelectedLocation(location);
    saveLocation(location);
    setQuery("");
  }

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Search" detail="Find cities, save favorites, or jump back to recent places" />
        <View style={[styles.searchBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
          <Ionicons name="search-outline" size={20} color={theme.colors.mutedText} />
          <TextInput
            accessibilityLabel="Search city"
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder="City or region"
            placeholderTextColor={theme.colors.mutedText}
            style={[styles.input, { color: theme.colors.text }]}
            value={query}
          />
        </View>
      </Panel>

      {results.isFetching ? <LoadingState label="Searching locations" /> : null}

      {results.data && results.data.length > 0 ? (
        <Panel>
          <SectionHeader title="Suggestions" />
          {results.data.map((location) => (
            <LocationRow key={location.id} location={location} onPress={() => selectLocation(location)} />
          ))}
        </Panel>
      ) : null}

      <Panel>
        <SectionHeader title="Favorites" />
        {savedLocations.filter((location) => location.isFavorite).map((location) => (
          <LocationRow key={location.id} location={location} onPress={() => setSelectedLocation(location)} />
        ))}
      </Panel>

      <Panel>
        <SectionHeader title="Recent" />
        {recentSearches.length === 0 ? (
          <Text style={[styles.empty, { color: theme.colors.mutedText }]}>Recent searches appear here.</Text>
        ) : recentSearches.map((location) => (
          <LocationRow key={location.id} location={location} onPress={() => setSelectedLocation(location)} />
        ))}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 14
  },
  input: {
    flex: 1,
    fontSize: 16,
    minHeight: 44
  },
  locationCopy: {
    flex: 1,
    gap: 2
  },
  locationDetail: {
    fontSize: 13
  },
  locationName: {
    fontSize: 15,
    fontWeight: "800"
  },
  row: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 56,
    paddingVertical: 8
  },
  searchBox: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12
  }
});
