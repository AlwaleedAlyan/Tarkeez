import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";

import { BrowserFocusTimer } from "@/components/BrowserFocusTimer";
import { Tappable } from "@/components/Tappable";
import { useLibrary } from "@/contexts/LibraryContext";
import {
  classifyUrl,
  extractDomain,
} from "@/features/classifier/urlClassifier";
import { classifyYouTubeVideo } from "@/features/classifier/youtubeClassifier";
import { parseYouTubeUrl } from "@/features/classifier/youtubeUrlParser";
import { useColors } from "@/hooks/useColors";
import { safeHost } from "@/lib/normalizeUrl";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = { url: string; title?: string };

type YTPlayer = {
  destroy(): void;
  getPlayerState(): number;
};

type YTPlayerConstructor = new (
  element: HTMLElement | string,
  options: {
    events?: {
      onReady?: (event: { target: YTPlayer }) => void;
      onStateChange?: (event: { data: number; target: YTPlayer }) => void;
    };
  },
) => YTPlayer;

declare global {
  interface Window {
    YT?: {
      Player: YTPlayerConstructor;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
        CUED: number;
        UNSTARTED: number;
      };
    };
    onYouTubeIframeAPIReady?: (() => void) | undefined;
  }
}

const YOUTUBE_API_SCRIPT_ID = "tarkeez-yt-iframe-api";

export function InAppBrowserWeb({ url, title }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { recordSession } = useLibrary();

  const [loading, setLoading] = useState(true);
  const [focusSec, setFocusSec] = useState(0);
  const [isEducational, setIsEducational] = useState<boolean | null>(null);
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const host = useMemo(() => safeHost(url), [url]);
  const displayTitle = title || host;
  const videoId = useMemo(() => parseYouTubeUrl(url), [url]);
  const isYouTubeVideo = !!videoId;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const focusSecRef = useRef(0);
  const lastEducationalUrlRef = useRef<string | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    focusSecRef.current = focusSec;
  }, [focusSec]);

  // Track page visibility: pause the timer when the tab/app is hidden.
  useEffect(() => {
    const onVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Classify the URL. YouTube videos get the dedicated video classifier;
  // everything else keeps the generic domain classifier.
  useEffect(() => {
    if (videoId) {
      setIsEducational(null);
      setVideoPlaying(false);
      classifyYouTubeVideo(videoId)
        .then((verdict) => {
          setIsEducational(verdict.isEducational);
          if (verdict.isEducational) {
            lastEducationalUrlRef.current = url;
          }
          // eslint-disable-next-line no-console
          console.log(
            `[classifier] youtube ${videoId} → ${verdict.isEducational ? "educational" : "off-topic"} (${verdict.reason})`,
          );
        })
        .catch(() => {
          // Classifier is fail-open by design.
          setIsEducational(true);
        });
      return;
    }

    const domain = extractDomain(url);
    if (!domain) {
      setIsEducational(true);
      return;
    }
    setIsEducational(null);
    classifyUrl(url)
      .then((verdict) => {
        setIsEducational(verdict.isEducational);
        if (verdict.isEducational) {
          lastEducationalUrlRef.current = url;
        }
      })
      .catch(() => {
        // Classifier is fail-open by design.
        setIsEducational(true);
      });
  }, [url, videoId]);

  // Set up the YouTube IFrame Player API for play-state detection.
  useEffect(() => {
    if (!isYouTubeVideo) {
      setCanGoBack(false);
      setCanGoForward(false);
      return;
    }

    setCanGoBack(false);
    setCanGoForward(false);

    const initPlayer = () => {
      if (!iframeRef.current || !window.YT?.Player) return;
      try {
        playerRef.current = new window.YT.Player(iframeRef.current, {
          events: {
            onReady: () => setVideoPlaying(false),
            onStateChange: (event) => {
              setVideoPlaying(event.data === window.YT?.PlayerState?.PLAYING);
            },
          },
        });
      } catch {
        // Fail-open: if the player API fails, treat the video as not playing.
        setVideoPlaying(false);
      }
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.getElementById(YOUTUBE_API_SCRIPT_ID)) {
        const tag = document.createElement("script");
        tag.id = YOUTUBE_API_SCRIPT_ID;
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScript = document.getElementsByTagName("script")[0];
        firstScript?.parentNode?.insertBefore(tag, firstScript);
      }
    }

    return () => {
      window.onYouTubeIframeAPIReady = undefined;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [isYouTubeVideo, videoId, reloadKey]);

  // Run the focus timer while the URL is educational, the page is visible,
  // and (for YouTube) the video is actually playing.
  const running = isYouTubeVideo
    ? isEducational === true && videoPlaying && isVisible
    : isEducational !== false && isVisible;
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    const id = setInterval(() => {
      if (runningRef.current) {
        setFocusSec((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Persist the browser study session on unmount, mirroring the native browser view.
  useEffect(() => {
    return () => {
      if (savedRef.current) return;
      const durationSec = focusSecRef.current;
      if (durationSec < 5) return;
      const fallbackDomain = url ? extractDomain(url) : null;
      const externalUrl = lastEducationalUrlRef.current ?? fallbackDomain;
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

  const handleGenericLoad = useCallback(() => {
    setLoading(false);
    try {
      const cw = iframeRef.current?.contentWindow;
      if (cw) {
        // Same-origin iframe: history is accessible.
        setCanGoBack(cw.history.length > 1);
        // We cannot reliably know forward availability from history.length,
        // so we enable forward optimistically and let the click no-op if empty.
        setCanGoForward(true);
      }
    } catch {
      // Cross-origin iframe: navigation history is inaccessible.
      setCanGoBack(false);
      setCanGoForward(false);
    }
  }, []);

  const handleYouTubeLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleReload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const handleGoBack = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {
      // Cross-origin history navigation is not allowed; ignore silently.
    }
  }, []);

  const handleGoForward = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {
      // Cross-origin history navigation is not allowed; ignore silently.
    }
  }, []);

  const embedOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const embedSrc = useMemo(() => {
    if (!videoId) return null;
    const params = new URLSearchParams({
      enablejsapi: "1",
      origin: embedOrigin,
      modestbranding: "1",
      rel: "0",
    });
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }, [videoId, embedOrigin, reloadKey]);

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
        <View style={styles.titleBox}>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: colors.foreground }]}
          >
            {displayTitle}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerHost, { color: colors.mutedForeground }]}
          >
            {host}
          </Text>
        </View>
        <BrowserFocusTimer focusSec={focusSec} running={running} />
        <Tappable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Done"
          style={({ pressed }) => [
            styles.doneBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.doneLabel, { color: colors.accent }]}>Done</Text>
        </Tappable>
      </View>

      {loading ? (
        <View style={{ height: 2, backgroundColor: colors.muted }}>
          <View
            style={{ height: 2, width: "100%", backgroundColor: colors.accent }}
          />
        </View>
      ) : null}

      <View style={styles.body}>
        {isYouTubeVideo && embedSrc ? (
          <iframe
            ref={iframeRef}
            key={`yt-${videoId}-${reloadKey}`}
            src={embedSrc}
            title={displayTitle}
            style={{ border: 0, width: "100%", height: "100%" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={handleYouTubeLoad}
          />
        ) : (
          <iframe
            ref={iframeRef}
            key={`generic-${reloadKey}`}
            src={url}
            title={displayTitle}
            style={{ border: 0, width: "100%", height: "100%" }}
            onLoad={handleGenericLoad}
          />
        )}
      </View>

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
        <Tappable
          onPress={handleGoBack}
          disabled={!canGoBack}
          hitSlop={8}
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.navBtn,
            { opacity: !canGoBack ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Tappable>
        <Tappable
          onPress={handleGoForward}
          disabled={!canGoForward}
          hitSlop={8}
          accessibilityLabel="Forward"
          style={({ pressed }) => [
            styles.navBtn,
            { opacity: !canGoForward ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="chevron-right" size={22} color={colors.foreground} />
        </Tappable>
        <Tappable
          onPress={handleReload}
          hitSlop={8}
          accessibilityLabel="Reload"
          style={({ pressed }) => [
            styles.navBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={18} color={colors.foreground} />
        </Tappable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleBox: {
    flex: 1,
    minWidth: 0,
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
  doneBtn: {
    height: 36,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  doneLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  body: {
    flex: 1,
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
