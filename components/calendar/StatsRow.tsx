import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

interface StatCardProps {
  value: string;
  label: string;
}

const TOKENS = {
  bgCard: "#242b24",
  bgCardHover: "#2a332a",
  border: "rgba(124, 184, 124, 0.1)",
  accent: "#7cb87c",
  textMuted: "#6a7a6a",
};

function StatCard({ value, label }: StatCardProps) {
  return (
    <View style={styles.card as any}>
      <Text style={styles.value as any}>{value}</Text>
      <Text style={styles.label as any}>{label}</Text>
    </View>
  );
}

interface StatsRowProps {
  totalHours: string;
  dailyAverage: string;
  streak: number;
  bestDay: string;
  compact?: boolean;
}

export default function StatsRow({
  totalHours,
  dailyAverage,
  streak,
  bestDay,
  compact = false,
}: StatsRowProps) {
  return (
    <View
      style={[
        styles.row as any,
        compact ? { gridTemplateColumns: "repeat(2, 1fr)" } : {},
      ]}
    >
      <StatCard value={totalHours} label="This Month" />
      <StatCard value={dailyAverage} label="Daily Avg" />
      <StatCard value={String(streak)} label="Day Streak" />
      <StatCard value={bestDay} label="Best Day" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    flexWrap: "wrap",
  },
  card: {
    flex: 1,
    backgroundColor: TOKENS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    transition: "background-color 0.2s ease",
    cursor: "default",
    ":hover": {
      backgroundColor: TOKENS.bgCardHover,
    },
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: TOKENS.accent,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: TOKENS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} as any);
