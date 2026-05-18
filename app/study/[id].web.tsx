import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import { fileUrl } from "@/lib/api";

const MIN_SESSION_SEC = 5;

export default function StudyScreenWeb() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMaterial, recordSession } = useLibrary();
  const material = id ? getMaterial(id) : undefined;

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topPad = Math.max(insets.top, 12);

  const sessionStartRef = useRef<number>(Date.now());
  const finalizedRef = useRef(false);
  const pausedMsRef = useRef(0);
  const hiddenSinceRef = useRef<number | null>(null);
  const materialIdRef = useRef<string | null>(null);
  materialIdRef.current = material?.id ?? null;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (hiddenSinceRef.current == null) {
          hiddenSinceRef.current = Date.now();
        }
      } else if (hiddenSinceRef.current != null) {
        pausedMsRef.current += Date.now() - hiddenSinceRef.current;
        hiddenSinceRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const materialId = materialIdRef.current;
    if (!materialId) return;
    const endedAt = Date.now();
    if (hiddenSinceRef.current != null) {
      pausedMsRef.current += endedAt - hiddenSinceRef.current;
      hiddenSinceRef.current = null;
    }
    const startedAt = sessionStartRef.current;
    const activeMs = Math.max(0, endedAt - startedAt - pausedMsRef.current);
    const durationSec = Math.round(activeMs / 1000);
    if (durationSec < MIN_SESSION_SEC) return;
    const pausedSec = Math.round(pausedMsRef.current / 1000);
    recordSession({
      materialId,
      noteId: null,
      startedAt,
      endedAt,
      durationSec,
      pausedSec,
      pagesRead: 0,
      pageTimes: {},
      selections: 0,
    }).catch(() => {
      /* swallow — best effort on unmount */
    });
  }, [recordSession]);

  useEffect(() => {
    return () => {
      finalize();
    };
  }, [finalize]);

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
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
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
        </Pressable>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {material?.title ?? "Material"}
        </Text>
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
    paddingBottom: 8,
    gap: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
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
