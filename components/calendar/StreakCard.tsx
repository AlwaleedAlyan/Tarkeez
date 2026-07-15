import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

interface StreakCardProps {
  currentStreak: number;
  bestStreak: number;
  weeklyActivity: number[];
}

export default function StreakCard({
  currentStreak,
  bestStreak,
  weeklyActivity,
}: StreakCardProps) {
  const colors = useColors();
  const max = Math.max(...weeklyActivity, 1);

  return (
    <View style={[styles.card as any, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header as any}>
        <Text style={[styles.title as any, { color: colors.foreground }]}>🔥 Streak</Text>
      </View>

      <View style={styles.numbers as any}>
        <View style={styles.numberBlock as any}>
          <Text style={[styles.number as any, { color: colors.accent }]}>{currentStreak}</Text>
          <Text style={[styles.numberLabel as any, { color: colors.mutedForeground }]}>Current</Text>
        </View>
        <View style={[styles.divider as any, { backgroundColor: colors.border }]} />
        <View style={styles.numberBlock as any}>
          <Text style={[styles.number as any, { color: colors.accent }]}>{bestStreak}</Text>
          <Text style={[styles.numberLabel as any, { color: colors.mutedForeground }]}>Best</Text>
        </View>
      </View>

      <View style={styles.chart as any}>
        <View style={styles.bars as any}>
          {weeklyActivity.map((value, i) => {
            const height = Math.max(8, (value / max) * 60);
            return (
              <View key={i} style={styles.barGroup as any}>
                <View style={[styles.bar as any, { height, backgroundColor: colors.accent }]} />
              </View>
            );
          })}
        </View>
        <View style={styles.labels as any}>
          {DAYS.map((d, i) => (
            <Text key={i} style={[styles.label as any, { color: colors.mutedForeground }]}>
              {d}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 18,
    ...(Platform.OS === "web" && {
      backgroundImage:
        "linear-gradient(135deg, rgba(124,184,124,0.1), rgba(255,170,68,0.05))",
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  numbers: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
  },
  numberBlock: {
    alignItems: "center",
    gap: 4,
  },
  number: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
  },
  numberLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 50,
  },
  chart: {
    gap: 8,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 60,
  },
  barGroup: {
    flex: 1,
    alignItems: "center",
  },
  bar: {
    width: "60%",
    maxWidth: 32,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
} as any);
