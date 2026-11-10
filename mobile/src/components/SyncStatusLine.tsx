import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ServerMirror } from "../hooks/useServerMirror";
import { useAppTheme } from "../theme/useAppTheme";

type IconName = ComponentProps<typeof Ionicons>["name"];

type SyncStatusLineProps = {
  mirror: ServerMirror;
  /** What a successful sync means for this data, e.g. "The alert server is watching these places." */
  syncedText: string;
};

/** One line saying where the server's copy stands, and a retry when it failed. */
export function SyncStatusLine({ mirror, syncedText }: SyncStatusLineProps) {
  const theme = useAppTheme();

  const view: Record<ServerMirror["status"], { icon: IconName; color: string; text: string }> = {
    syncing: { icon: "sync-outline", color: theme.colors.mutedText, text: "Sending to the alert server…" },
    synced: { icon: "cloud-done-outline", color: theme.colors.success, text: syncedText },
    unregistered: {
      icon: "cloud-offline-outline",
      color: theme.colors.warning,
      text: "Saved on this phone only. This phone is not registered with the alert server yet."
    },
    failed: {
      icon: "alert-circle-outline",
      color: theme.colors.danger,
      text: `Saved on this phone, but the alert server did not get it${mirror.error == null ? "." : ` (${mirror.error}).`}`
    }
  };
  const { icon, color, text } = view[mirror.status];

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.text, { color: theme.colors.mutedText }]}>{text}</Text>
      {mirror.status === "failed" ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry sync" onPress={mirror.retry} hitSlop={8}>
          <Text style={[styles.retry, { color: theme.colors.primary }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  retry: {
    fontSize: 13,
    fontWeight: "700"
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  }
});
