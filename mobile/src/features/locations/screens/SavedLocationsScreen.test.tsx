import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { DefaultUserPreferences, type LocationResult, type WeatherBundle } from "@nimbus/shared";
import { apiGet, apiPut } from "../../../services/apiClient";
import { setInstallationId } from "../../../services/installationStore";
import { defaultLocation, useLocationStore } from "../../../state/locationStore";
import { usePreferencesStore } from "../../../state/preferencesStore";
import { renderWithProviders } from "../../../test/render";
import { locationSubtitle } from "../components/SavedLocationRow";
import { SavedLocationsScreen, savedCountDetail } from "./SavedLocationsScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("../../../services/apiClient", () => ({ apiGet: jest.fn(), apiPut: jest.fn(), apiPost: jest.fn() }));

const get = jest.mocked(apiGet);
const put = jest.mocked(apiPut);

const paris: LocationResult = {
  id: "paris-fr",
  name: "Paris",
  region: "Île-de-France",
  country: "France",
  coordinates: { lat: 48.8566, lon: 2.3522 },
  timezone: "Europe/Paris",
  isFavorite: false
};

function bundle(temperature: number, source: "openweathermap" | "sample" = "openweathermap"): WeatherBundle {
  return { current: { temperature, conditionText: "Light rain" }, source } as unknown as WeatherBundle;
}

beforeEach(async () => {
  mockNavigate.mockReset();
  get.mockReset().mockResolvedValue(bundle(0));
  put.mockReset().mockResolvedValue({});
  await setInstallationId("33333333-3333-4333-8333-333333333333");
  useLocationStore.setState({ savedLocations: [defaultLocation, paris], selectedLocation: defaultLocation });
  usePreferencesStore.setState({ preferences: DefaultUserPreferences });
});

// Let pending weather queries settle inside act() before the tree unmounts.
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

/** Render, then let the first round of query and sync promises settle inside act(). */
async function renderScreen() {
  renderWithProviders(<SavedLocationsScreen />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function ids() {
  return useLocationStore.getState().savedLocations.map((location) => location.id);
}

describe("SavedLocationsScreen", () => {
  it("lists saved places with their current reading, keeping a real zero", async () => {
    await renderScreen();

    expect(screen.getByText("Tirana")).toBeTruthy();
    expect(screen.getByText("Île-de-France, France")).toBeTruthy();
    expect(screen.getByText("2 places")).toBeTruthy();
    expect(await screen.findAllByText("0 C")).toHaveLength(2);
  });

  it("shows no number while loading or after a failure", async () => {
    get.mockImplementation((_path, params) => (
      params?.lat === paris.coordinates.lat ? Promise.reject(new Error("down")) : new Promise(() => undefined)
    ));
    renderWithProviders(<SavedLocationsScreen />);

    expect(screen.getAllByText("Loading…")).toHaveLength(2);
    expect(await screen.findByText("Weather unavailable")).toBeTruthy();
    expect(screen.getAllByText("Loading…")).toHaveLength(1);
    expect(screen.queryByText(/ C$/)).toBeNull();
  });

  it("labels sample-provider readings and honours imperial units", async () => {
    usePreferencesStore.setState({ preferences: { ...DefaultUserPreferences, units: "imperial" } });
    get.mockResolvedValue(bundle(20, "sample"));
    await renderScreen();

    expect(await screen.findAllByText("68 F")).toHaveLength(2);
    expect(screen.getAllByText("Sample data")).toHaveLength(2);
  });

  it("opens a place on the Home tab", async () => {
    await renderScreen();
    fireEvent.press(screen.getByLabelText("Show weather for Paris"));
    expect(useLocationStore.getState().selectedLocation.id).toBe("paris-fr");
    expect(mockNavigate).toHaveBeenCalledWith("Home");
  });

  it("favourites, reorders and removes places", async () => {
    await renderScreen();

    fireEvent.press(screen.getByLabelText("Add Paris to favourites"));
    expect(useLocationStore.getState().savedLocations[1]?.isFavorite).toBe(true);
    expect(screen.getByLabelText("Remove Paris from favourites")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Move Paris up"));
    expect(ids()).toEqual(["paris-fr", "tirana-al"]);
    fireEvent.press(screen.getByLabelText("Move Paris down"));
    expect(ids()).toEqual(["tirana-al", "paris-fr"]);

    fireEvent.press(screen.getByLabelText("Remove Paris"));
    expect(ids()).toEqual(["tirana-al"]);
    expect(screen.getByText("1 place")).toBeTruthy();
  });

  it("disables moving past either end", async () => {
    await renderScreen();
    expect(screen.getByLabelText("Move Tirana up").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText("Move Paris down").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("offers to save the place being shown when it is not saved", async () => {
    useLocationStore.setState({ savedLocations: [defaultLocation], selectedLocation: paris });
    await renderScreen();

    fireEvent.press(screen.getByLabelText("Save Paris"));
    expect(ids()).toEqual(["paris-fr", "tirana-al"]);
    expect(screen.queryByLabelText("Save Paris")).toBeNull();
  });

  it("explains the empty state and links to Search", async () => {
    useLocationStore.setState({ savedLocations: [] });
    await renderScreen();

    expect(screen.getByText(/Severe weather alerts only cover places saved here/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Find a place"));
    expect(mockNavigate).toHaveBeenCalledWith("Search");
  });

  it("mirrors changes to the server and says when it has them", async () => {
    await renderScreen();
    expect(await screen.findByText("The alert server is watching these places.")).toBeTruthy();
    expect(put).toHaveBeenLastCalledWith("locations/saved/33333333-3333-4333-8333-333333333333", {
      locations: [expect.objectContaining({ id: "tirana-al" }), expect.objectContaining({ id: "paris-fr" })]
    });

    put.mockClear();
    fireEvent.press(screen.getByLabelText("Remove Paris"));
    await waitFor(() => expect(put).toHaveBeenCalledWith(expect.any(String), {
      locations: [expect.objectContaining({ id: "tirana-al" })]
    }));
  });

  it("says the list is phone-only when the phone is not registered", async () => {
    await setInstallationId("");
    await renderScreen();
    expect(await screen.findByText(/Saved on this phone only/)).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
  });

  it("shows a failed sync and retries it", async () => {
    put.mockRejectedValueOnce(new Error("Nimbus API error 503"));
    await renderScreen();

    expect(await screen.findByText(/did not get it \(Nimbus API error 503\)/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Retry sync"));
    });
    expect(await screen.findByText("The alert server is watching these places.")).toBeTruthy();
  });

  it("warns when there are more places than the server accepts", async () => {
    const many = Array.from({ length: 51 }, (_, index) => ({ ...paris, id: `p${index}`, name: `P${index}` }));
    useLocationStore.setState({ savedLocations: many, selectedLocation: many[0] ?? paris });
    await renderScreen();
    expect(screen.getByText(/accepts at most 50 places. Remove 1 to get alerts again/)).toBeTruthy();
    expect(await screen.findAllByText("0 C")).toHaveLength(51);
  });
});

describe("helpers", () => {
  it("formats counts and subtitles without empty parts", async () => {
    expect(savedCountDetail(0)).toBe("0 places");
    expect(savedCountDetail(1)).toBe("1 place");
    expect(locationSubtitle({ ...paris, region: undefined })).toBe("France");
    expect(locationSubtitle({ ...paris, region: "" })).toBe("France");
  });
});
