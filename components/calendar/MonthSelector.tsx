import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { Tappable } from "@/components/Tappable";
import { formatMonthYear } from "@/lib/calendarUtils";

const TOKENS = {
  bgCard: "#242b24",
  bgCell: "#1e241e",
  border: "rgba(124, 184, 124, 0.1)",
  accent: "#7cb87c",
  accentDim: "rgba(124, 184, 124, 0.15)",
  textPrimary: "#ffffff",
  textSecondary: "#a0b0a0",
};

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
  return (
    <View style={styles.container as any}>
      <View style={styles.left as any}>
        <Tappable onPress={onPrev} style={styles.arrowBtn as any}>
          <Feather name="chevron-left" size={20} color={TOKENS.textPrimary} />
        </Tappable>
        <Text style={styles.monthLabel as any}>{formatMonthYear(currentMonth)}</Text>
        <Tappable onPress={onNext} style={styles.arrowBtn as any}>
          <Feather name="chevron-right" size={20} color={TOKENS.textPrimary} />
        </Tappable>
      </View>
      <Tappable onPress={onToday} style={styles.todayBtn as any}>
        <Text style={styles.todayText as any}>Today</Text>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: TOKENS.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    backgroundColor: TOKENS.bgCell,
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.15s ease",
    ":hover": {
      backgroundColor: TOKENS.accentDim,
    },
  },
  monthLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: TOKENS.textPrimary,
    minWidth: 160,
    textAlign: "center",
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TOKENS.border,
    transition: "border-color 0.15s ease",
    ":hover": {
      borderColor: TOKENS.accent,
    },
  },
  todayText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: TOKENS.textSecondary,
  },
} as any);
