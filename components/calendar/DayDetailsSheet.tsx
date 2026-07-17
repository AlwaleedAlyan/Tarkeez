import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SessionItem from "@/components/calendar/SessionItem";
import { Tappable } from "@/components/Tappable";
import { useColors } from "@/hooks/useColors";
import {
  formatDayMonth,
  formatDayName,
  formatDuration,
  type Session,
} from "@/lib/calendarUtils";

interface DayDetailsSheetProps {
  date: Date | null;
  minutes: number;
  sessions: Session[];
  onClose: () => void;
}

// Bottom sheet showing the tapped day's focus total and its sessions.
export default function DayDetailsSheet({
  date,
  minutes,
  sessions,
  onClose,
}: DayDetailsSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const durationLabel = minutes > 0 ? formatDuration(minutes) : "0m";
  const sessionLabel = `${sessions.length} ${
    sessions.length === 1 ? "session" : "sessions"
  }`;

  return (
    <Modal
      visible={date !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {date ? formatDayName(date) : ""}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {date ? formatDayMonth(date) : ""}
            </Text>
          </View>
          <Tappable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                backgroundColor: colors.muted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            accessibilityLabel="Close"
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </Tappable>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryAccent, { color: colors.accent }]}>
            {durationLabel}
          </Text>
          <Text style={[styles.summaryText, { color: colors.mutedForeground }]}>
            focused · {sessionLabel}
          </Text>
        </View>

        {sessions.length > 0 ? (
          <ScrollView
            style={styles.sessionList}
            contentContainerStyle={styles.sessionListContent}
            showsVerticalScrollIndicator={false}
          >
            {sessions.map((s) => (
              <SessionItem key={s.id} session={s} />
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            No focus sessions this day.
          </Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  summaryAccent: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  summaryText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  sessionList: {
    maxHeight: 320,
  },
  sessionListContent: {
    gap: 8,
  },
  empty: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
});
