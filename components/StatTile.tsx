import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  accent?: boolean;
  style?: ViewStyle;
};

export function StatTile({ label, value, icon, accent, style }: Props) {
  const colors = useColors();
  const bg = accent ? colors.primary : colors.card;
  const fg = accent ? colors.primaryForeground : colors.foreground;
  const subFg = accent ? colors.primaryForeground : colors.mutedForeground;
  const iconBg = accent ? "rgba(255,255,255,0.18)" : colors.secondary;
  const iconColor = accent ? colors.primaryForeground : colors.primary;

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: bg, borderColor: accent ? bg : colors.border },
        style,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.value, { color: fg }]}>{value}</Text>
      <Text style={[styles.label, { color: subFg, opacity: accent ? 0.85 : 1 }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    letterSpacing: -0.5,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
