import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { StyleSheet, Text, View } from "react-native";
import { IconButton } from "../../../components/IconButton";
import { Panel } from "../../../components/Panel";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { SyncStatusLine } from "../../../components/SyncStatusLine";
import { useServerMirror } from "../../../hooks/useServerMirror";
import type { MainTabParamList } from "../../../navigation/RootNavigator";
import { MAX_SYNCED_LOCATIONS, syncSavedLocations } from "../../../services/locationSyncService";
import { useLocationStore } from "../../../state/locationStore";
import { usePreferencesStore } from "../../../state/preferencesStore";
import { useAppTheme } from "../../../theme/useAppTheme";
import { SavedLocationRow } from "../components/SavedLocationRow";

type Navigation = BottomTabNavigationProp<MainTabParamList>;

export function savedCountDetail(count: number): string {
  return count === 1 ? "1 place" : `${count} places`;
}

/**
 * The places this phone keeps, and the list the alert scanner watches (T1/T2).
 *
 * Every change is mirrored to `PUT /v1/locations/saved/:installationId`, and
 * the status line says whether the server actually has it: a list that only
 * lives on the phone gets no alerts, and the screen must not imply otherwise.
 */
export function SavedLocationsScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Navigation>();
  const savedLocations = useLocationStore((state) => state.savedLocations);
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const setSelectedLocation = useLocationStore((state) => state.setSelectedLocation);
  const saveLocation = useLocationStore((state) => state.saveLocation);
  const removeLocation = useLocationStore((state) => state.removeLocation);
  const toggleFavorite = useLocationStore((state) => state.toggleFavorite);
  const moveLocation = useLocationStore((state) => state.moveLocation);
  const units = usePreferencesStore((state) => state.preferences.units);
  const mirror = useServerMirror(savedLocations, syncSavedLocations);

  const selectedIsSaved = savedLocations.some((location) => location.id === selectedLocation.id);
  const overLimit = savedLocations.length > MAX_SYNCED_LOCATIONS;

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Saved places" detail={savedCountDetail(savedLocations.length)} />
        <SyncStatusLine mirror={mirror} syncedText="The alert server is watching these places." />
        {overLimit ? (
          <Text style={[styles.note, { color: theme.colors.danger }]}>
            The alert server accepts at most {MAX_SYNCED_LOCATIONS} places. Remove {savedLocations.length - MAX_SYNCED_LOCATIONS} to get alerts again.
          </Text>
        ) : null}
        {selectedIsSaved ? null : (
          <IconButton
            icon="bookmark-outline"
            label={`Save ${selectedLocation.name}`}
            onPress={() => saveLocation(selectedLocation)}
            tone="primary"
          />
        )}
      </Panel>

      <Panel>
        {savedLocations.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={34} color={theme.colors.mutedText} />
            <Text style={[styles.note, { color: theme.colors.mutedText }]}>
              No saved places. Severe weather alerts only cover places saved here.
            </Text>
            <IconButton icon="search-outline" label="Find a place" onPress={() => navigation.navigate("Search")} />
          </View>
        ) : (
          savedLocations.map((location, index) => (
            <SavedLocationRow
              key={location.id}
              location={location}
              units={units}
              isSelected={location.id === selectedLocation.id}
              isFirst={index === 0}
              isLast={index === savedLocations.length - 1}
              onOpen={() => {
                setSelectedLocation(location);
                navigation.navigate("Home");
              }}
              onToggleFavorite={() => toggleFavorite(location.id)}
              onMove={(delta) => moveLocation(location.id, delta)}
              onRemove={() => removeLocation(location.id)}
            />
          ))
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "flex-start",
    gap: 10
  },
  note: {
    fontSize: 13,
    lineHeight: 19
  }
});
