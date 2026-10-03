import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Nimbus Weather",
  slug: "nimbus-weather",
  scheme: "nimbus",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./src/assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    backgroundColor: "#0B1020",
    image: "./src/assets/splash.png",
    resizeMode: "contain"
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.nimbus.weather",
    infoPlist: {
      NSLocationWhenInUseUsageDescription: "Nimbus uses your location to show local weather and alerts.",
      UIBackgroundModes: ["fetch", "remote-notification"]
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#0B1020",
      foregroundImage: "./src/assets/adaptive-icon.png"
    },
    package: "com.nimbus.weather",
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS"]
  },
  plugins: [
    "expo-location",
    "expo-notifications",
    "expo-secure-store",
    "react-native-reanimated"
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/v1"
  }
});
