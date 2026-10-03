import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Alert, StyleSheet, View } from "react-native";
import { IconButton } from "../../../components/IconButton";
import { LoadingState } from "../../../components/LoadingState";
import { Screen } from "../../../components/Screen";
import type { RootStackParamList } from "../../../navigation/RootNavigator";
import { getDeviceLocation } from "../../../services/locationService";
import { useLocationStore } from "../../../state/locationStore";
import { usePreferencesStore } from "../../../state/preferencesStore";
import { AstronomyStrip } from "../../astronomy/components/AstronomyStrip";
import { AirQualityCard } from "../components/AirQualityCard";
import { CurrentWeatherHero } from "../components/CurrentWeatherHero";
import { DailyForecastList } from "../components/DailyForecastList";
import { HourlyChart } from "../components/HourlyChart";
import { InsightList } from "../components/InsightList";
import { MetricGrid } from "../components/MetricGrid";
import { useWeatherBundle } from "../hooks/useWeather";

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<Navigation>();
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const setSelectedLocation = useLocationStore((state) => state.setSelectedLocation);
  const saveLocation = useLocationStore((state) => state.saveLocation);
  const units = usePreferencesStore((state) => state.preferences.units);
  const weather = useWeatherBundle(selectedLocation);

  async function useGpsLocation() {
    try {
      const location = await getDeviceLocation();
      setSelectedLocation(location);
      saveLocation(location);
    } catch (error) {
      Alert.alert("Location unavailable", error instanceof Error ? error.message : "Could not read device location.");
    }
  }

  if (weather.isLoading && !weather.data) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!weather.data) {
    return (
      <Screen>
        <IconButton icon="refresh-outline" label="Retry forecast" onPress={() => void weather.refetch()} tone="primary" />
      </Screen>
    );
  }

  const bundle = weather.data;

  return (
    <Screen>
      <CurrentWeatherHero current={bundle.current} location={bundle.location} units={units} />
      <View style={styles.actions}>
        <IconButton icon="locate-outline" label="GPS" onPress={() => void useGpsLocation()} tone="primary" />
        <IconButton icon="git-compare-outline" label="Compare" onPress={() => navigation.navigate("Compare")} tone="secondary" />
        <IconButton icon="airplane-outline" label="Trip" onPress={() => navigation.navigate("TravelPlanner")} />
      </View>
      <InsightList insights={bundle.insights} />
      {/* `timezone` is the LOCATION's, threaded into every formatter below. A
          forecast instant is not a device-local instant, and the default made
          every day of the daily list read as the previous calendar day for
          anyone west of UTC. */}
      <HourlyChart hourly={bundle.hourly} units={units} timezone={bundle.location.timezone} />
      <DailyForecastList daily={bundle.daily} units={units} timezone={bundle.location.timezone} />
      <AirQualityCard airQuality={bundle.airQuality} />
      <AstronomyStrip astronomy={bundle.astronomy} timezone={bundle.location.timezone} />
      <MetricGrid current={bundle.current} units={units} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
