import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { Session } from "@/lib/calendarUtils";

const TOPIC_ICONS: Record<string, string> = {
  notes: "📝",
  math: "📊",
  reading: "📄",
  coding: "💻",
  default: "📚",
};

interface SessionItemProps {
  session: Session;
}

export default function SessionItem({ session }: SessionItemProps) {
  const colors = useColors();
  const icon = TOPIC_ICONS[session.topic] ?? TOPIC_ICONS.default;
  const h = Math.floor(session.duration / 60);
  const m = session.duration % 60;
  const durationLabel =
    h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

  return (
    <View style={[styles.container as any, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <View style={[styles.iconBox as any, { backgroundColor: colors.secondary }]}>
        <Text style={styles.icon as any}>{icon}</Text>
      </View>
      <View style={styles.info as any}>
        <Text style={[styles.title as any, { color: colors.foreground }]} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={[styles.meta as any, { color: colors.mutedForeground }]}>
          {session.startTime}
          {session.pagesRead ? ` · ${session.pagesRead} pages` : ""}
        </Text>
      </View>
      <View style={styles.right as any}>
        <Text style={[styles.duration as any, { color: colors.accent }]}>{durationLabel}</Text>
        <Text style={[styles.focus as any, { color: colors.mutedForeground }]}>{session.focusScore}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    transition: "background-color 0.15s ease",
    cursor: "default",
    ":hover": {
      opacity: 0.9,
    },
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  meta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  duration: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  focus: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
} as any);
