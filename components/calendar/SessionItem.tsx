import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import type { Session } from "@/lib/calendarUtils";

const TOKENS = {
  bgCell: "#1e241e",
  bgCardHover: "#2a332a",
  accentDim: "rgba(124, 184, 124, 0.15)",
  border: "rgba(124, 184, 124, 0.1)",
  accent: "#7cb87c",
  textPrimary: "#ffffff",
  textSecondary: "#a0b0a0",
  textMuted: "#6a7a6a",
};

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
  const icon = TOPIC_ICONS[session.topic] ?? TOPIC_ICONS.default;
  const h = Math.floor(session.duration / 60);
  const m = session.duration % 60;
  const durationLabel =
    h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

  return (
    <View style={styles.container as any}>
      <View style={styles.iconBox as any}>
        <Text style={styles.icon as any}>{icon}</Text>
      </View>
      <View style={styles.info as any}>
        <Text style={styles.title as any} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={styles.meta as any}>
          {session.startTime}
          {session.pagesRead ? ` · ${session.pagesRead} pages` : ""}
        </Text>
      </View>
      <View style={styles.right as any}>
        <Text style={styles.duration as any}>{durationLabel}</Text>
        <Text style={styles.focus as any}>{session.focusScore}%</Text>
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
    backgroundColor: TOKENS.bgCell,
    borderWidth: 1,
    borderColor: TOKENS.border,
    transition: "background-color 0.15s ease",
    cursor: "default",
    ":hover": {
      backgroundColor: TOKENS.bgCardHover,
    },
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: TOKENS.accentDim,
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
    color: TOKENS.textPrimary,
  },
  meta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: TOKENS.textSecondary,
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
  },
  duration: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: TOKENS.accent,
  },
  focus: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: TOKENS.textMuted,
  },
} as any);
