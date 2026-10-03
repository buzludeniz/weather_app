import { LoadingState } from "../../../components/LoadingState";
import { Panel } from "../../../components/Panel";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { useLocationStore } from "../../../state/locationStore";
import { useMapLayers, useWeatherBundle } from "../../weather/hooks/useWeather";
import { InteractiveWeatherMap } from "./InteractiveWeatherMap";

export function MapsScreen() {
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const bundle = useWeatherBundle(selectedLocation);
  const layers = useMapLayers();
  const mapLayers = layers.data ?? bundle.data?.mapLayers;

  return (
    <Screen scroll={false}>
      <Panel>
        <SectionHeader title="Weather maps" detail="Pinch, pan, switch layers, and scrub radar playback" />
      </Panel>
      {!mapLayers ? <LoadingState label="Loading map layers" /> : <InteractiveWeatherMap layers={mapLayers} />}
    </Screen>
  );
}
