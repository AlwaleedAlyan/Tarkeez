import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { BrowserFocusTimer } from "@/components/BrowserFocusTimer";
import { classifyYouTubeVideo } from "@/features/classifier/youtubeClassifier";
import { parseYouTubeUrl } from "@/features/classifier/youtubeUrlParser";
import { useColors } from "@/hooks/useColors";
import { safeHost } from "@/lib/normalizeUrl";

export default function BrowserView() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const host = useMemo(() => safeHost(url ?? ""), [url]);
  const lastClassifiedVideoIdRef = useRef<string | null>(null);

  const [focusSec, setFocusSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) setFocusSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    const videoId = parseYouTubeUrl(nav.url);
    if (!videoId) {
      setPaused(false);
      return;
    }
    if (videoId === lastClassifiedVideoIdRef.current) return;
    lastClassifiedVideoIdRef.current = videoId;
    classifyYouTubeVideo(videoId)
      .then((verdict) => {
        setPaused(!verdict.isEducational);
        // eslint-disable-next-line no-console
        console.log(
          `[classifier] youtube ${videoId} → ${verdict.isEducational ? "educational" : "off-topic"} (${verdict.reason})`,
        );
      })
      .catch(() => {
        // classifier is fail-open by design; nothing to do.
      });
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: colors.foreground }]}
          >
            {title || host}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerHost, { color: colors.mutedForeground }]}
          >
            {host}
          </Text>
        </View>
        <BrowserFocusTimer focusSec={focusSec} running={!paused} />
      </View>
      <WebView
        source={{ uri: url ?? "" }}
        style={{ flex: 1, backgroundColor: colors.background }}
        onNavigationStateChange={onNavigationStateChange}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  headerHost: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 1,
  },
});
