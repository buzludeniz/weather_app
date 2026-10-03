import { useQuery } from "@tanstack/react-query";
import type { LocationResult, MapLayer, WeatherBundle } from "@nimbus/shared";
import { apiGet } from "../../../services/apiClient";

export function useWeatherBundle(location: LocationResult) {
  return useQuery({
    queryKey: ["weather", "bundle", location.coordinates.lat, location.coordinates.lon],
    queryFn: () => apiGet<WeatherBundle>("/weather/bundle", {
      lat: location.coordinates.lat,
      lon: location.coordinates.lon
    })
  });
}

export function useMapLayers() {
  return useQuery({
    queryKey: ["weather", "mapLayers"],
    queryFn: () => apiGet<MapLayer[]>("/weather/maps/layers"),
    staleTime: 1000 * 60 * 15
  });
}
