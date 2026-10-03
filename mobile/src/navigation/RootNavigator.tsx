import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { ComponentProps } from "react";
import { AlertsScreen } from "../features/alerts/screens/AlertsScreen";
import { CompareScreen } from "../features/compare/screens/CompareScreen";
import { SavedLocationsScreen } from "../features/locations/screens/SavedLocationsScreen";
import { MapsScreen } from "../features/maps/screens/MapsScreen";
import { SearchScreen } from "../features/search/screens/SearchScreen";
import { SettingsScreen } from "../features/settings/screens/SettingsScreen";
import { TravelPlannerScreen } from "../features/travel/screens/TravelPlannerScreen";
import { HomeScreen } from "../features/weather/screens/HomeScreen";
import { useAppTheme } from "../theme/useAppTheme";

export type RootStackParamList = {
  Tabs: undefined;
  Compare: undefined;
  TravelPlanner: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Maps: undefined;
  Alerts: undefined;
  Saved: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

type IconName = ComponentProps<typeof Ionicons>["name"];

const tabIcons: Record<keyof MainTabParamList, IconName> = {
  Alerts: "warning-outline",
  Home: "partly-sunny-outline",
  Maps: "map-outline",
  Saved: "bookmark-outline",
  Search: "search-outline",
  Settings: "settings-outline"
};

function MainTabs() {
  const theme = useAppTheme();

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedText,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border
        },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={tabIcons[route.name]} color={color} size={size} />
        )
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
      <Tabs.Screen name="Maps" component={MapsScreen} />
      <Tabs.Screen name="Alerts" component={AlertsScreen} />
      <Tabs.Screen name="Saved" component={SavedLocationsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const theme = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.background },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Compare" component={CompareScreen} options={{ title: "Compare Cities" }} />
      <Stack.Screen name="TravelPlanner" component={TravelPlannerScreen} options={{ title: "Travel Planner" }} />
    </Stack.Navigator>
  );
}
