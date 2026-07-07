import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import { fileUrl } from "@/lib/api";

const MIN_SESSION_SEC = 5;

function fmtClock(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function StudyScreenWeb() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMaterial, recordSession } = useLibrary();
  const material = id ? getMaterial(id) : undefined;

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [pausedSec, setPausedSec] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  const topPad = Math.max(insets.top, 12);

  const sessionStartRef = useRef<number>(Date.now());
  const finalizedRef = useRef(false);
  const hiddenSinceRef = useRef<number | null>(null);
  const materialIdRef = useRef<string | null>(null);
  const secondsRef = useRef(0);
  const pausedSecRef = useRef(0);
  const isRunningRef = useRef(true);

  materialIdRef.current = material?.id ?? null;
  secondsRef.current = seconds;
  pausedSecRef.current = pausedSec;
  isRunningRef.current = isRunning;

  // Pause/resume when the browser tab is hidden or shown.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        setIsRunning(false);
        if (hiddenSinceRef.current == null) {
          hiddenSinceRef.current = Date.now();
        }
      } else {
        setIsRunning(true);
        if (hiddenSinceRef.current != null) {
          const deltaMs = Date.now() - hiddenSinceRef.current;
          hiddenSinceRef.current = null;
          setPausedSec((p) => p + Math.round(deltaMs / 1000));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // One-second ticker: count focus seconds while running, paused seconds otherwise.
  useEffect(() => {
    const id = setInterval(() => {
      if (isRunningRef.current) {
        setSeconds((s) => s + 1);
      } else {
        setPausedSec((p) => p + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const focusPct = useMemo(() => {
    const wall = seconds + pausedSec;
    if (wall === 0) return 100;
    return Math.round((seconds / wall) * 100);
  }, [seconds, pausedSec]);

  const status = useMemo(() => {
    if (!isRunning) {
      return {
        text: "Paused",
        color: colors.mutedForeground,
      };
    }
    return {
      text: "Reading",
      color: "#5fb37b",
    };
  }, [isRunning, colors]);

  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const materialId = materialIdRef.current;
    if (!materialId) return;

    const endedAt = Date.now();
    // Account for time spent hidden while the unmount is happening.
    if (hiddenSinceRef.current != null) {
      const deltaMs = endedAt - hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      pausedSecRef.current += Math.round(deltaMs / 1000);
    }

    const durationSec = secondsRef.current;
    const paused = pausedSecRef.current;
    if (durationSec < MIN_SESSION_SEC) return;

    recordSession({
      materialId,
      noteId: null,
      startedAt: sessionStartRef.current,
      endedAt,
      durationSec,
      pausedSec: paused,
      pagesRead: 0,
      pageTimes: {},
      selections: 0,
    }).catch(() => {
      /* swallow — best effort on unmount */
    });
  }, [recordSession]);

  // Ref-stable cleanup: re-memoizing `finalize` must not trip the cleanup.
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;
  useEffect(() => () => finalizeRef.current(), []);

  useEffect(() => {
    if (!id || !material) return;
    let cancelled = false;
    setError(null);
    setUrl(null);
    (async () => {
      try {
        const signed = await fileUrl(id);
        if (!cancelled) setUrl(signed);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, material]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Tappable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Tappable>

        <View style={styles.headerCenter}>
          <Text
            numberOfLines={1}
            style={[styles.title, { color: colors.foreground }]}
          >
            {material?.title ?? "Material"}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
              {status.text}
            </Text>
            <Text style={[styles.sep, { color: colors.mutedForeground }]}>
              ·
            </Text>
            <Text style={[styles.clock, { color: colors.foreground }]}>
              {fmtClock(seconds)}
            </Text>
            <Text style={[styles.sep, { color: colors.mutedForeground }]}>
              ·
            </Text>
            <Text style={[styles.pct, { color: colors.mutedForeground }]}>
              {focusPct}%
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {!material ? (
          <View style={styles.centered}>
            <Text style={{ color: colors.mutedForeground }}>
              Material not found.
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Feather
                name="alert-triangle"
                size={28}
                color={colors.destructive}
              />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Could not load PDF
              </Text>
              <Text
                style={[styles.cardBody, { color: colors.mutedForeground }]}
              >
                {error}
              </Text>
            </View>
          </View>
        ) : !url ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <iframe
            src={url}
            title={material.title}
            style={iframeStyle}
            allow="fullscreen"
          />
        )}
      </View>
    </View>
  );
}

const iframeStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  sep: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  clock: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  pct: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  body: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    maxWidth: 420,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  cardBody: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
