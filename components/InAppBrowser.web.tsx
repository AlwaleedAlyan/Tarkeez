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
import { useColors } from "@/hooks/useColors";
import { safeHost } from "@/lib/normalizeUrl";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = { url: string; title?: string };

export function InAppBrowserWeb({ url, title }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { recordSession } = useLibrary();

  const [loading, setLoading] = useState(true);
  const [focusSec, setFocusSec] = useState(0);
  const [isEducational, setIsEducational] = useState<boolean | null>(null);
  const [isVisible, setIsVisible] = useState(!document.hidden);

  const host = useMemo(() => safeHost(url), [url]);
  const displayTitle = title || host;

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

  // Classify the URL once on mount. Cross-origin iframes cannot be inspected,
  // so we classify the top-level URL and treat the whole visible session as
  // focused study time when the URL is educational.
  useEffect(() => {
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
  }, [url]);

  // Run the focus timer while the URL is educational and the page is visible.
  const running = isEducational !== false && isVisible;
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

  const handleLoad = useCallback(() => {
    setLoading(false);
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
        {/* Cross-origin iframes can't be intercepted; sites with X-Frame-Options: DENY won't render. */}
        <iframe
          src={url}
          title={displayTitle}
          style={{ border: 0, width: "100%", height: "100%" }}
          onLoad={handleLoad}
        />
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
});
