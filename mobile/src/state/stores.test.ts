import { DefaultUserPreferences, type LocationResult } from "@nimbus/shared";
import { defaultLocation, useLocationStore } from "./locationStore";
import { usePreferencesStore } from "./preferencesStore";

const place = (id: string): LocationResult => ({ ...defaultLocation, id, name: id, isFavorite: false });

describe("locationStore.moveLocation", () => {
  beforeEach(() => {
    useLocationStore.setState({ savedLocations: [place("a"), place("b"), place("c")] });
  });

  it("reorders saved locations, which sets the synced sort order", () => {
    useLocationStore.getState().moveLocation("c", -1);
    expect(useLocationStore.getState().savedLocations.map((l) => l.id)).toEqual(["a", "c", "b"]);
  });

  it("leaves the list alone for an unknown id", () => {
    useLocationStore.getState().moveLocation("zzz", 1);
    expect(useLocationStore.getState().savedLocations.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});

describe("preferencesStore.setQuietHours", () => {
  it("sets both ends and keeps the other notification settings", () => {
    usePreferencesStore.setState({ preferences: DefaultUserPreferences });
    usePreferencesStore.getState().setQuietHours("23:00", "06:00");
    expect(usePreferencesStore.getState().preferences.notifications).toEqual({
      ...DefaultUserPreferences.notifications,
      quietHoursStart: "23:00",
      quietHoursEnd: "06:00"
    });
  });
});
