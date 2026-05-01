import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { Material, Session } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  material: Material;
  sessions: Session[];
  onPress: () => void;
};

function fmtMinutes(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function MaterialCard({ material, sessions, onPress }: Props) {
  const colors = useColors();

  const stats = useMemo(() => {
    const mine = sessions.filter((s) => s.materialId === material.id);
    const total = mine.reduce((sum, s) => sum + s.durationSec, 0);
    return { totalSec: total, sessionCount: mine.length };
  }, [sessions, material.id]);

  const total = material.totalPages ?? 0;
  const progress = total > 0 ? Math.min(1, material.currentPage / total) : 0;

  const handle = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handle}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
        <Feather name="file-text" size={22} color={colors.primary} />
      </View>

      <View style={styles.content}>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: colors.foreground }]}
        >
          {material.title}
        </Text>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {fmtMinutes(stats.totalSec)}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="bookmark" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {total > 0
                ? `${material.currentPage}/${total}`
                : `Page ${material.currentPage}`}
            </Text>
          </View>
        </View>

        {total > 0 ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: colors.accent,
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    lineHeight: 21,
  },
  meta: {
    flexDirection: "row",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
});
