import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface Props {
  focusSec: number;
  running: boolean;
}

function formatMMSS(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function BrowserFocusTimer({ focusSec, running }: Props) {
  const colors = useColors();
  const textColor = running ? colors.foreground : colors.mutedForeground;

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.muted, borderColor: colors.border },
      ]}
      accessibilityRole="text"
      accessibilityLabel={
        running ? `Focus timer running ${formatMMSS(focusSec)}` : `Focus timer paused ${formatMMSS(focusSec)}`
      }
    >
      {running ? (
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
      ) : (
        <Feather name="moon" size={12} color={colors.mutedForeground} />
      )}
      <Text style={[styles.time, { color: textColor }]}>
        {formatMMSS(focusSec)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  time: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
});
