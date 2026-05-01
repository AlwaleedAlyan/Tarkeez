import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  description?: string;
};

export function EmptyState({ icon, title, description }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrapper}>
      <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    textAlign: "center",
  },
  desc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
