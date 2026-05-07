import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { Collection } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  collection: Collection;
  count: number;
  onPress: () => void;
  onLongPress?: () => void;
};

export function CollectionCard({
  collection,
  count,
  onPress,
  onLongPress,
}: Props) {
  const colors = useColors();

  const handle = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  const handleLong = () => {
    if (!onLongPress) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onLongPress();
  };

  return (
    <Pressable
      onPress={handle}
      onLongPress={onLongPress ? handleLong : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
        <Feather name="folder" size={22} color={colors.primary} />
      </View>
      <Text
        numberOfLines={2}
        style={[styles.title, { color: colors.foreground }]}
      >
        {collection.name}
      </Text>
      <Text style={[styles.count, { color: colors.mutedForeground }]}>
        {count} {count === 1 ? "material" : "materials"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  count: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
