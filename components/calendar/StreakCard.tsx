import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

const TOKENS = {
  bgCard: "#242b24",
  border: "rgba(124, 184, 124, 0.2)",
  accent: "#7cb87c",
  textPrimary: "#ffffff",
  textMuted: "#6a7a6a",
};

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
  const max = Math.max(...weeklyActivity, 1);

  return (
    <View style={styles.card as any}>
      <View style={styles.header as any}>
        <Text style={styles.title as any}>🔥 Streak</Text>
      </View>

      <View style={styles.numbers as any}>
        <View style={styles.numberBlock as any}>
          <Text style={styles.number as any}>{currentStreak}</Text>
          <Text style={styles.numberLabel as any}>Current</Text>
        </View>
        <View style={styles.divider as any} />
        <View style={styles.numberBlock as any}>
          <Text style={styles.number as any}>{bestStreak}</Text>
          <Text style={styles.numberLabel as any}>Best</Text>
        </View>
      </View>

      <View style={styles.chart as any}>
        <View style={styles.bars as any}>
          {weeklyActivity.map((value, i) => {
            const height = Math.max(8, (value / max) * 60);
            return (
              <View key={i} style={styles.barGroup as any}>
                <View style={[styles.bar as any, { height }]} />
              </View>
            );
          })}
        </View>
        <View style={styles.labels as any}>
          {DAYS.map((d, i) => (
            <Text key={i} style={styles.label as any}>
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
    backgroundColor: TOKENS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    color: TOKENS.textPrimary,
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
    color: TOKENS.accent,
  },
  numberLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: TOKENS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 50,
    backgroundColor: TOKENS.border,
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
    backgroundColor: TOKENS.accent,
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
    color: TOKENS.textMuted,
  },
} as any);
