import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../../../components/Panel";
import { Screen } from "../../../components/Screen";
import { SectionHeader } from "../../../components/SectionHeader";
import { useAppTheme } from "../../../theme/useAppTheme";

/**
 * PLACEHOLDER — not implemented.
 *
 * `RootNavigator` routed to this screen before it existed, so `tsc` could not
 * resolve four modules and typecheck could not pass. The route is kept rather
 * than deleted so navigation compiles, and this screen says plainly that there is
 * nothing here. It deliberately renders no sample rows: a screen with nothing to
 * show should say so rather than show something invented.
 *
 * TODO(SettingsScreen): replace with the real screen.
 */
export function SettingsScreen() {
  const theme = useAppTheme();

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Settings" detail="Not built yet" />
        <View style={styles.empty}>
          <Ionicons name="settings-outline" size={34} color={theme.colors.mutedText} />
          <Text style={[styles.detail, { color: theme.colors.mutedText }]}>Units, theme, and notification preferences. This screen is a placeholder: the tab exists so navigation compiles, and nothing has been implemented behind it.</Text>
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "flex-start",
    gap: 10,
    paddingTop: 14
  },
  detail: {
    fontSize: 13,
    lineHeight: 19
  }
});
