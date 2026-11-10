import { Ionicons } from "@expo/vector-icons";
import type { ThemePreference, Units } from "@nimbus/shared";
import type { ComponentProps } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { IconButton } from "../../../components/IconButton";
import { Panel } from "../../../components/Panel";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { SyncStatusLine } from "../../../components/SyncStatusLine";
import { ToggleRow } from "../../../components/ToggleRow";
import { useServerMirror } from "../../../hooks/useServerMirror";
import { scheduleDailyForecast } from "../../../services/notificationService";
import { syncNotificationPreferences } from "../../../services/preferencesSyncService";
import { registerInstallation, useRegistrationStore } from "../../../services/registrationService";
import { usePreferencesStore } from "../../../state/preferencesStore";
import { useAppTheme } from "../../../theme/useAppTheme";
import { QuietHoursEditor } from "../components/QuietHoursEditor";
import { useTestAlert } from "../hooks";
import { describePushStatus, type PushStatusView } from "../pushStatus";

type IconName = ComponentProps<typeof Ionicons>["name"];

const unitOptions: { label: string; value: Units }[] = [
  { label: "Metric (°C, km/h)", value: "metric" },
  { label: "Imperial (°F, mph)", value: "imperial" }
];

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" }
];

/**
 * Units, theme, and the alert settings the server acts on.
 *
 * Only settings something reads are shown. The scanner reads `severeAlerts`
 * and the quiet-hours window; the daily forecast is a local notification. The
 * stored `rainSoon`, `airQuality`, language and privacy flags have no consumer
 * yet, so they get no switch: a toggle that changes nothing would be a lie.
 */
export function SettingsScreen() {
  const theme = useAppTheme();
  const preferences = usePreferencesStore((state) => state.preferences);
  const setUnits = usePreferencesStore((state) => state.setUnits);
  const setTheme = usePreferencesStore((state) => state.setTheme);
  const toggleNotification = usePreferencesStore((state) => state.toggleNotification);
  const setQuietHours = usePreferencesStore((state) => state.setQuietHours);
  const registration = useRegistrationStore();
  const mirror = useServerMirror(preferences.notifications, syncNotificationPreferences);
  const testAlert = useTestAlert();

  const push = describePushStatus(registration);
  const toneIcon: Record<PushStatusView["tone"], { icon: IconName; color: string }> = {
    ok: { icon: "notifications-outline", color: theme.colors.success },
    pending: { icon: "hourglass-outline", color: theme.colors.mutedText },
    warning: { icon: "notifications-off-outline", color: theme.colors.warning },
    error: { icon: "alert-circle-outline", color: theme.colors.danger }
  };

  function toggleDailyForecast() {
    toggleNotification("dailyForecast");
    scheduleDailyForecast(usePreferencesStore.getState().preferences.notifications).catch((error: unknown) => {
      console.warn("[nimbus] could not schedule the daily forecast", error);
    });
  }

  function retryRegistration() {
    registerInstallation().catch((error: unknown) => {
      console.warn("[nimbus] registration retry failed", error);
    });
  }

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Units" />
        <SegmentedControl options={unitOptions} value={preferences.units} onChange={setUnits} />
      </Panel>

      <Panel>
        <SectionHeader title="Appearance" />
        <SegmentedControl options={themeOptions} value={preferences.theme} onChange={setTheme} />
      </Panel>

      <Panel>
        <SectionHeader title="Severe weather alerts" detail="For your saved places" />
        <View style={styles.statusRow}>
          <Ionicons name={toneIcon[push.tone].icon} size={18} color={toneIcon[push.tone].color} />
          <Text style={[styles.note, { color: theme.colors.mutedText }]}>{push.text}</Text>
        </View>
        {push.action === "retry" ? (
          <IconButton icon="refresh-outline" label="Register again" onPress={retryRegistration} />
        ) : null}
        {push.action === "open-settings" ? (
          <IconButton icon="settings-outline" label="Open system settings" onPress={() => void Linking.openSettings()} />
        ) : null}
        <ToggleRow
          label="Severe weather alerts"
          description="Nimbus advisories inferred from forecast conditions. Not official weather warnings."
          value={preferences.notifications.severeAlerts}
          onChange={() => toggleNotification("severeAlerts")}
        />
        <QuietHoursEditor
          start={preferences.notifications.quietHoursStart}
          end={preferences.notifications.quietHoursEnd}
          onChange={setQuietHours}
        />
        <SyncStatusLine mirror={mirror} syncedText="The alert server has these settings." />
      </Panel>

      <Panel>
        <SectionHeader title="On this phone" />
        <ToggleRow
          label="Daily forecast reminder"
          description="A local reminder at 07:30 to check the forecast. It does not contain weather data."
          value={preferences.notifications.dailyForecast}
          onChange={toggleDailyForecast}
        />
      </Panel>

      {__DEV__ ? (
        <Panel tone="alt">
          <SectionHeader title="Developer" detail="Development builds only" />
          <Text style={[styles.note, { color: theme.colors.mutedText }]}>
            Injects a severe wind alert at one of this phone's saved places and runs a scan, through the same path as a real alert. Only non-production servers accept it.
          </Text>
          <IconButton icon="flash-outline" label="Send a test severe alert" onPress={() => void testAlert.send()} />
          {testAlert.state.phase === "idle" ? null : (
            <Text style={[styles.note, { color: testAlert.state.phase === "failed" ? theme.colors.danger : theme.colors.text }]}>
              {testAlert.state.phase === "sending" ? "Sending…" : testAlert.state.message}
            </Text>
          )}
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  }
});
