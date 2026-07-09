import React, { useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Tappable } from "@/components/Tappable";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  formatDuration,
  formatMonthYear,
  getHeatColor,
  type CalendarDay,
} from "@/lib/calendarUtils";

const TOKENS = {
  accent: "#7cb87c",
  accentLight: "#9dd49d",
  textMuted: "#6a7a6a",
  streakGold: "#ffaa44",
};

interface CalendarCellProps {
  day: CalendarDay;
  minutes: number;
  monthMaxMinutes: number;
  isSelected: boolean;
  isStreak: boolean;
  showDuration: boolean;
  onSelect: (date: Date) => void;
}

export default function CalendarCell({
  day,
  minutes,
  monthMaxMinutes,
  isSelected,
  isStreak,
  showDuration,
  onSelect,
}: CalendarCellProps) {
  const reducedMotion = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [pageX, setPageX] = useState(0);
  const [pageY, setPageY] = useState(0);

  const colors = getHeatColor(minutes, monthMaxMinutes);
  const hasData = minutes > 0;
  const displayDuration = showDuration && hasData ? formatDuration(minutes) : "";

  const handleLayout = (e: LayoutChangeEvent) => {
    setLayout(e.nativeEvent.layout);
  };

  const handleMouseEnter = () => {
    if (Platform.OS !== "web") return;
    setHover(true);
  };

  const handleMouseMove = (e: any) => {
    if (Platform.OS !== "web") return;
    setPageX(e.nativeEvent?.pageX ?? 0);
    setPageY(e.nativeEvent?.pageY ?? 0);
  };

  const handleMouseLeave = () => {
    if (Platform.OS !== "web") return;
    setHover(false);
  };

  const ariaLabel = `${formatMonthYear(day.date)} ${day.day}, ${
    hasData ? formatDuration(minutes) + " studied" : "no study session"
  }`;

  return (
    <View style={styles.wrapper as any} onLayout={handleLayout}>
      <Tappable
        onPress={() => onSelect(day.date)}
        style={({ pressed }) => [
          styles.cell as any,
          {
            backgroundColor: colors.bg,
            opacity: day.isCurrentMonth ? 1 : 0.3,
            borderWidth:
              isSelected || day.isToday || hover || pressed ? 2 : 0,
            borderColor: isSelected
              ? TOKENS.accentLight
              : day.isToday || hover
                ? TOKENS.accent
                : "transparent",
            ...(day.isToday && Platform.OS === "web"
              ? { boxShadow: `0 0 0 1px ${TOKENS.accent}` }
              : {}),
            transform:
              hover && !reducedMotion ? [{ scale: 1.05 }] : [{ scale: 1 }],
          },
        ]}
        // @ts-ignore - web mouse events
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        accessibilityLabel={ariaLabel}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        <Text style={[styles.dayNumber as any, { color: colors.text }]}>
          {day.day}
        </Text>
        {displayDuration ? (
          <Text style={[styles.duration as any, { color: colors.text }]}>
            {displayDuration}
          </Text>
        ) : null}
        {hasData ? (
          <View
            style={[
              styles.dot as any,
              { backgroundColor: colors.text },
            ]}
          />
        ) : null}
        {isStreak && hasData ? (
          <Text style={styles.streakBadge as any}>🔥</Text>
        ) : null}
      </Tappable>

      {hover && Platform.OS === "web" ? (
        <View
          style={[
            styles.tooltip as any,
            {
              left: pageX - layout.x - 60,
              top: pageY - layout.y - 40,
            },
          ]}
          // @ts-ignore
          role="tooltip"
        >
          <Text style={styles.tooltipText as any}>
            {formatMonthYear(day.date)} {day.day}:{" "}
            {hasData ? formatDuration(minutes) + " studied" : "No study session"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    aspectRatio: 1,
    width: "100%",
    position: "relative",
  },
  cell: {
    flex: 1,
    borderRadius: 4,
    padding: 6,
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    transition: "transform 0.15s ease, border-color 0.15s ease, background-color 0.2s ease",
    cursor: "pointer",
    zIndex: 1,
    ":hover": {
      zIndex: 2,
    },
  },
  dayNumber: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    lineHeight: 18,
  },
  duration: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    lineHeight: 12,
  },
  dot: {
    position: "absolute",
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  streakBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    fontSize: 9,
  },
  tooltip: {
    position: "absolute",
    backgroundColor: "#111611",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(124, 184, 124, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 10,
    pointerEvents: "none",
    minWidth: 120,
    alignItems: "center",
  },
  tooltipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#ffffff",
    whiteSpace: "nowrap",
  },
} as any);
