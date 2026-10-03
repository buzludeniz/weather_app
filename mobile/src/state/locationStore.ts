import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LocationResult } from "@nimbus/shared";

export const defaultLocation: LocationResult = {
  id: "tirana-al",
  name: "Tirana",
  region: "Tirana County",
  country: "Albania",
  coordinates: { lat: 41.3275, lon: 19.8189 },
  timezone: "Europe/Tirane",
  isFavorite: true
};

type LocationState = {
  selectedLocation: LocationResult;
  savedLocations: LocationResult[];
  recentSearches: LocationResult[];
  setSelectedLocation: (location: LocationResult) => void;
  saveLocation: (location: LocationResult) => void;
  removeLocation: (id: string) => void;
  toggleFavorite: (id: string) => void;
};

function uniqueById(locations: LocationResult[]): LocationResult[] {
  return Array.from(new Map(locations.map((location) => [location.id, location])).values());
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      selectedLocation: defaultLocation,
      savedLocations: [defaultLocation],
      recentSearches: [],
      setSelectedLocation: (location) => set((state) => ({
        selectedLocation: location,
        recentSearches: uniqueById([location, ...state.recentSearches]).slice(0, 8)
      })),
      saveLocation: (location) => set((state) => ({
        savedLocations: uniqueById([location, ...state.savedLocations])
      })),
      removeLocation: (id) => set((state) => ({
        savedLocations: state.savedLocations.filter((location) => location.id !== id)
      })),
      toggleFavorite: (id) => set((state) => ({
        savedLocations: state.savedLocations.map((location) => (
          location.id === id ? { ...location, isFavorite: !location.isFavorite } : location
        ))
      }))
    }),
    {
      name: "nimbus-locations",
      storage: createJSONStorage(() => AsyncStorage)
    }
  )
);
