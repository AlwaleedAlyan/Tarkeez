import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import { BrowserFocusTimer } from "@/components/BrowserFocusTimer";
import { useLibrary } from "@/contexts/LibraryContext";
import { classifyUrl, extractDomain } from "@/features/classifier/urlClassifier";
import { classifyYouTubeVideo } from "@/features/classifier/youtubeClassifier";
import { parseYouTubeUrl } from "@/features/classifier/youtubeUrlParser";
import { useColors } from "@/hooks/useColors";
import { safeHost } from "@/lib/normalizeUrl";

type BrowserMessage = {
  type: "video";
  state: "play" | "pause" | "waiting" | "ended";
};

const YOUTUBE_HOST_RE = /(?:^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/;

// Installs a MutationObserver that binds play/pause/ended listeners to every
// <video> element on the page (including ones added later by SPA navigation).
// Posts state transitions to RN via window.ReactNativeWebView.
//
// YouTube renders the main player AND tiny autoplaying thumbnail/up-next
// previews as separate <video> elements. We distinguish them by rendered
// size — only videos whose bounding rect is above MIN_AREA count as real
// playback. This works whether the user has unmuted or not (iOS WebView
// enforces muted autoplay even on the main player).
const INJECTED_VIDEO_LISTENER = `(function(){
  try {
    if (window.__tarkeezVideoHookInstalled) return;
    window.__tarkeezVideoHookInstalled = true;
    var MIN_AREA = 80000; // ~ 320x250 — bigger than YouTube thumbnails, smaller than the main player
    var bound = new WeakMap();
    var playing = new Set();
    var lastPosted = null;
    var post = function(state){
      if (state === lastPosted) return;
      lastPosted = state;
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'video', state: state })
        );
      } catch (e) {}
    };
    var emit = function(){
      post(playing.size > 0 ? 'play' : 'pause');
    };
    var isRealVideo = function(v){
      try {
        var r = v.getBoundingClientRect();
        return (r.width * r.height) >= MIN_AREA;
      } catch (e) { return false; }
    };
    var syncOne = function(v, id){
      if (!v.paused && isRealVideo(v)) {
        playing.add(id);
      } else {
        playing.delete(id);
      }
    };
    var nextId = 1;
    var bind = function(v){
      if (bound.has(v)) return;
      var id = nextId++;
      bound.set(v, id);
      var handler = function(){ syncOne(v, id); emit(); };
      v.addEventListener('play', handler);
      v.addEventListener('pause', handler);
      v.addEventListener('ended', handler);
      // No initial snapshot — timer stays paused until an explicit play event.
    };
    var scan = function(){
      var vids = document.getElementsByTagName('video');
      for (var i = 0; i < vids.length; i++) bind(vids[i]);
    };
    scan();
    if (window.MutationObserver) {
      var mo = new MutationObserver(scan);
      mo.observe(document.documentElement || document.body, {
        childList: true, subtree: true
      });
    }
    // Re-evaluate every 1s in case a video resizes (fullscreen toggle,
    // mini-player) or starts playing without firing a 'play' event.
    setInterval(function(){
      var vids = document.getElementsByTagName('video');
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        var id = bound.get(v);
        if (id == null) continue;
        syncOne(v, id);
      }
      emit();
    }, 1000);
  } catch (e) {}
})(); true;`;

export default function BrowserView() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const host = useMemo(() => safeHost(url ?? ""), [url]);
  const { recordSession } = useLibrary();
  const lastClassifiedVideoIdRef = useRef<string | null>(null);
  const lastClassifiedDomainRef = useRef<string | null>(null);
  const webviewRef = useRef<WebView>(null);

  const [focusSec, setFocusSec] = useState(0);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [isEducational, setIsEducational] = useState<boolean | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const isYouTubeHost = !!host && YOUTUBE_HOST_RE.test(host);
  const running = isYouTubeHost
    ? isEducational === true && videoPlaying
    : isEducational !== false;
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const startedAtRef = useRef<number>(Date.now());
  const focusSecRef = useRef(0);
  useEffect(() => {
    focusSecRef.current = focusSec;
  }, [focusSec]);
  const lastEducationalUrlRef = useRef<string | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      if (runningRef.current) setFocusSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // On unmount, persist the accumulated focus seconds to study_sessions
  // (offline-first via recordSession). Skip trivial visits (<5s) and
  // visits with no captured URL.
  useEffect(() => {
    return () => {
      if (savedRef.current) return;
      const durationSec = focusSecRef.current;
      if (durationSec < 5) return;
      const externalUrl = lastEducationalUrlRef.current ?? url ?? null;
      if (!externalUrl) return;
      savedRef.current = true;
      void recordSession({
        materialId: null,
        noteId: null,
        externalUrl,
        startedAt: startedAtRef.current,
        endedAt: Date.now(),
        durationSec,
        pausedSec: 0,
      });
    };
  }, [recordSession, url]);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    const videoId = parseYouTubeUrl(nav.url);
    if (videoId !== lastClassifiedVideoIdRef.current) {
      lastClassifiedVideoIdRef.current = videoId;
      setCurrentVideoId(videoId);
      setIsEducational(null);
      setVideoPlaying(false);
    }
    if (videoId) {
      classifyYouTubeVideo(videoId)
        .then((verdict) => {
          if (lastClassifiedVideoIdRef.current !== videoId) return;
          setIsEducational(verdict.isEducational);
          if (verdict.isEducational) {
            lastEducationalUrlRef.current = nav.url;
          }
          // eslint-disable-next-line no-console
          console.log(
            `[classifier] youtube ${videoId} → ${verdict.isEducational ? "educational" : "off-topic"} (${verdict.reason})`,
          );
        })
        .catch(() => {
          // classifier is fail-open by design; nothing to do.
        });
      return;
    }

    const domain = extractDomain(nav.url);
    if (domain === lastClassifiedDomainRef.current) return;
    lastClassifiedDomainRef.current = domain;
    if (!domain) {
      setIsEducational(true);
      return;
    }
    setIsEducational(null);
    classifyUrl(nav.url)
      .then((verdict) => {
        if (lastClassifiedDomainRef.current !== domain) return;
        setIsEducational(verdict.isEducational);
        if (verdict.isEducational) {
          lastEducationalUrlRef.current = nav.url;
        }
        // eslint-disable-next-line no-console
        console.log(
          `[classifier] url ${domain} → ${verdict.isEducational ? "educational" : "off-topic"} (${verdict.reason})`,
        );
      })
      .catch(() => {
        // classifier is fail-open by design; nothing to do.
      });
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: BrowserMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as BrowserMessage;
    } catch {
      return;
    }
    if (msg.type === "video") {
      setVideoPlaying(msg.state === "play");
    }
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
        <BrowserFocusTimer focusSec={focusSec} running={running} />
      </View>
      <WebView
        ref={webviewRef}
        source={{ uri: url ?? "" }}
        style={{ flex: 1, backgroundColor: colors.background }}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
        injectedJavaScript={INJECTED_VIDEO_LISTENER}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
      />
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + 8,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable
          onPress={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          hitSlop={8}
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.navBtn,
            { opacity: !canGoBack ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          hitSlop={8}
          accessibilityLabel="Forward"
          style={({ pressed }) => [
            styles.navBtn,
            { opacity: !canGoForward ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => webviewRef.current?.reload()}
          hitSlop={8}
          accessibilityLabel="Reload"
          style={({ pressed }) => [
            styles.navBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={18} color={colors.foreground} />
        </Pressable>
      </View>
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
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
