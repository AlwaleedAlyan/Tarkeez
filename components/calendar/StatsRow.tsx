import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  value: string;
  label: string;
}

function StatCard({ value, label }: StatCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.card as any, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.value as any, { color: colors.accent }]}>{value}</Text>
      <Text style={[styles.label as any, { color: colors.mutedForeground }]}>{label}</Text>
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    transition: "background-color 0.2s ease",
    cursor: "default",
    ":hover": {
      opacity: 0.9,
    },
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
} as any);
