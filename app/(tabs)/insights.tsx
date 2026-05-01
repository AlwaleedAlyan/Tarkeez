import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { SharePostModal } from "@/components/SharePostModal";
import { StatTile } from "@/components/StatTile";
import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

function fmtDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}

function pct(focus: number, paused: number) {
  const wall = focus + paused;
  if (wall === 0) return 100;
  return Math.round((focus / wall) * 100);
}

const DAYS_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sessions, materials } = useLibrary();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : insets.bottom + 80;

  const stats = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());

    let totalSec = 0;
    let totalPausedSec = 0;
    let todaySec = 0;
    let todayPausedSec = 0;
    let todayPages = 0;
    let weekSec = 0;
    let pages = 0;

    const dayBuckets = Array(7).fill(0);

    for (const s of sessions) {
      const paused = s.pausedSec ?? 0;
      totalSec += s.durationSec;
      totalPausedSec += paused;
      pages += s.pagesRead;
      const d = new Date(s.startedAt);
      if (d >= startOfDay) {
        todaySec += s.durationSec;
        todayPausedSec += paused;
        todayPages += s.pagesRead;
      }
      if (d >= startOfWeek) {
        weekSec += s.durationSec;
        dayBuckets[d.getDay()] += s.durationSec;
      }
    }

    const maxBucket = Math.max(...dayBuckets, 1);
    const todayIndex = now.getDay();

    return {
      totalSec,
      totalPausedSec,
      todaySec,
      todayPausedSec,
      todayPages,
      weekSec,
      pages,
      sessionsCount: sessions.length,
      dayBuckets,
      maxBucket,
      todayIndex,
      totalFocusPct: pct(totalSec, totalPausedSec),
      todayFocusPct: pct(todaySec, todayPausedSec),
    };
  }, [sessions]);

  const [shareOpen, setShareOpen] = useState(false);
  const useToday = stats.todaySec > 0;
  const shareFocusedSec = useToday ? stats.todaySec : stats.totalSec;
  const sharePages = useToday ? stats.todayPages : stats.pages;
  const shareFocusPct = useToday ? stats.todayFocusPct : stats.totalFocusPct;

  const recent = useMemo(() => sessions.slice(0, 8), [sessions]);

  const materialName = (id: string) =>
    materials.find((m) => m.id === id)?.title ?? "Removed material";

  const focusBarRatio = stats.totalSec + stats.totalPausedSec > 0
    ? stats.totalSec / (stats.totalSec + stats.totalPausedSec)
    : 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: bottomPad,
          paddingHorizontal: 20,
          gap: 24,
        }}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
              Insights
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Your focus
            </Text>
          </View>
          <Pressable
            onPress={() => setShareOpen(true)}
            accessibilityLabel="Create a post"
            style={({ pressed }) => [
              styles.postBtn,
              {
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather
              name="share-2"
              size={14}
              color={colors.primaryForeground}
            />
            <Text
              style={[styles.postBtnText, { color: colors.primaryForeground }]}
            >
              Post
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile
              label="Today"
              value={fmtDuration(stats.todaySec)}
              icon="sun"
              accent
            />
            <StatTile
              label="This week"
              value={fmtDuration(stats.weekSec)}
              icon="calendar"
            />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatTile
              label="Total focus"
              value={fmtDuration(stats.totalSec)}
              icon="clock"
            />
            <StatTile
              label="Pages read"
              value={stats.pages.toString()}
              icon="file-text"
            />
          </View>
        </View>

        {/* Focus quality card */}
        <View
          style={[
            styles.qualityCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.qualityHead}>
            <View
              style={[styles.qualityIcon, { backgroundColor: colors.secondary }]}
            >
              <Feather name="zap" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.qualityLabel, { color: colors.mutedForeground }]}>
                Focus quality
              </Text>
              <Text style={[styles.qualityValue, { color: colors.foreground }]}>
                {stats.totalFocusPct}
                <Text style={[styles.qualityUnit, { color: colors.mutedForeground }]}>
                  {" "}%
                </Text>
              </Text>
            </View>
            {stats.todaySec + stats.todayPausedSec > 0 ? (
              <View style={styles.qualityToday}>
                <Text
                  style={[styles.qualityTodayLabel, { color: colors.mutedForeground }]}
                >
                  Today
                </Text>
                <Text style={[styles.qualityTodayValue, { color: colors.foreground }]}>
                  {stats.todayFocusPct}%
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.focusBar, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.focusBarFill,
                {
                  width: `${focusBarRatio * 100}%`,
                  backgroundColor: colors.accent,
                },
              ]}
            />
          </View>

          <View style={styles.qualityLegend}>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: colors.accent }]}
              />
              <Text style={[styles.legendText, { color: colors.foreground }]}>
                {fmtDuration(stats.totalSec)} focused
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: colors.muted }]}
              />
              <Text style={[styles.legendText, { color: colors.mutedForeground }]}>
                {fmtDuration(stats.totalPausedSec)} idle
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              This week
            </Text>
            <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
              {stats.sessionsCount} sessions
            </Text>
          </View>
          <View style={styles.barChart}>
            {stats.dayBuckets.map((sec, i) => {
              const h = Math.max(8, (sec / stats.maxBucket) * 110);
              const isToday = i === stats.todayIndex;
              return (
                <View key={i} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: h,
                        backgroundColor:
                          sec === 0
                            ? colors.muted
                            : isToday
                              ? colors.accent
                              : colors.primary,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.dayLabel,
                      {
                        color: isToday ? colors.foreground : colors.mutedForeground,
                        fontFamily: isToday
                          ? "Inter_600SemiBold"
                          : "Inter_500Medium",
                      },
                    ]}
                  >
                    {DAYS_LABEL[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent sessions
          </Text>
          {recent.length === 0 ? (
            <View style={{ paddingVertical: 24 }}>
              <EmptyState
                icon="activity"
                title="No sessions yet"
                description="Start studying to see your activity here."
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {recent.map((s) => {
                const sFocusPct = pct(s.durationSec, s.pausedSec ?? 0);
                return (
                  <View
                    key={s.id}
                    style={[
                      styles.sessionRow,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.sessionIcon,
                        { backgroundColor: colors.secondary },
                      ]}
                    >
                      <Feather name="clock" size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.sessionTitle, { color: colors.foreground }]}
                      >
                        {materialName(s.materialId)}
                      </Text>
                      <Text
                        style={[
                          styles.sessionMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {new Date(s.startedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {s.pagesRead > 0
                          ? `${s.pagesRead} ${s.pagesRead === 1 ? "page" : "pages"}`
                          : "no pages"}
                        {" · "}
                        {sFocusPct}% focus
                      </Text>
                    </View>
                    <Text style={[styles.sessionDur, { color: colors.foreground }]}>
                      {fmtDuration(s.durationSec)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {shareOpen ? (
        <SharePostModal
          focusedSec={shareFocusedSec}
          pagesStudied={sharePages}
          focusPct={shareFocusPct}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
  },
  postBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  kicker: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: -0.8,
  },
  qualityCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
  },
  qualityHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qualityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qualityLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  qualityValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    letterSpacing: -1,
    marginTop: 2,
  },
  qualityUnit: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    letterSpacing: 0,
  },
  qualityToday: {
    alignItems: "flex-end",
  },
  qualityTodayLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  qualityTodayValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 2,
  },
  focusBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  focusBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  qualityLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  card: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    gap: 18,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  cardMeta: { fontFamily: "Inter_500Medium", fontSize: 13 },
  barChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    height: 150,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 8,
  },
  dayLabel: { fontSize: 11 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  sessionMeta: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  sessionDur: { fontFamily: "Inter_700Bold", fontSize: 14 },
});
