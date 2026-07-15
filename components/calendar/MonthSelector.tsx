import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { Tappable } from "@/components/Tappable";
import { useColors } from "@/hooks/useColors";
import { formatMonthYear } from "@/lib/calendarUtils";

interface MonthSelectorProps {
  currentMonth: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function MonthSelector({
  currentMonth,
  onPrev,
  onNext,
  onToday,
}: MonthSelectorProps) {
  const colors = useColors();

  return (
    <View style={[styles.container as any, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.left as any}>
        <Tappable onPress={onPrev} style={[styles.arrowBtn as any, { backgroundColor: colors.muted }]}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </Tappable>
        <Text style={[styles.monthLabel as any, { color: colors.foreground }]}>{formatMonthYear(currentMonth)}</Text>
        <Tappable onPress={onNext} style={[styles.arrowBtn as any, { backgroundColor: colors.muted }]}>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </Tappable>
      </View>
      <Tappable onPress={onToday} style={[styles.todayBtn as any, { borderColor: colors.border }]}>
        <Text style={[styles.todayText as any, { color: colors.mutedForeground }]}>Today</Text>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    paddingHorizontal: 12,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.15s ease",
    ":hover": {
      opacity: 0.8,
    },
  },
  monthLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    minWidth: 160,
    textAlign: "center",
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    transition: "border-color 0.15s ease",
    ":hover": {
      borderColor: "transparent",
    },
  },
  todayText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
} as any);
