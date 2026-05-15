import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigation,
  WebViewProgressEvent,
} from "react-native-webview/lib/WebViewTypes";

import { useColors } from "@/hooks/useColors";
import { safeHost } from "@/lib/normalizeUrl";

type Props = { url: string; title?: string };

export function InAppBrowser({ url, title }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const ref = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [currentTitle, setCurrentTitle] = useState(title ?? "");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const host = useMemo(() => safeHost(currentUrl), [currentUrl]);

  const onShouldStartLoadWithRequest = useCallback(
    (req: ShouldStartLoadRequest): boolean => {
      const u = req.url ?? "";
      if (
        /^https?:\/\//i.test(u) ||
        u === "about:blank" ||
        u.startsWith("data:")
      ) {
        return true;
      }
      if (/^(mailto|tel|sms):/i.test(u)) {
        Linking.openURL(u).catch(() => {});
        return false;
      }
      return false;
    },
    [],
  );

  const headerTitle = currentTitle || host;
  const displayTitle = title || headerTitle;

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
        <View style={styles.navCluster}>
          <Pressable
            onPress={() => ref.current?.goBack()}
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
            onPress={() => ref.current?.goForward()}
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
            onPress={() => ref.current?.reload()}
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

        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Done"
          style={({ pressed }) => [
            styles.doneBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.doneLabel, { color: colors.accent }]}>Done</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ height: 2, backgroundColor: colors.muted }}>
          <View
            style={{
              height: 2,
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: colors.accent,
            }}
          />
        </View>
      ) : null}

      <View style={styles.body}>
        <WebView
          ref={ref}
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: colors.background }}
          originWhitelist={["https://*", "http://*", "about:*"]}
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={(nav: WebViewNavigation) => {
            setCurrentUrl(nav.url);
            if (nav.title) setCurrentTitle(nav.title);
            setCanGoBack(nav.canGoBack);
            setCanGoForward(nav.canGoForward);
          }}
          onLoadStart={() => {
            setLoading(true);
            setErrorMessage(null);
          }}
          onLoadProgress={({ nativeEvent }: WebViewProgressEvent) =>
            setProgress(nativeEvent.progress)
          }
          onLoadEnd={() => setLoading(false)}
          onError={({ nativeEvent }: WebViewErrorEvent) =>
            setErrorMessage(nativeEvent.description || "Failed to load page")
          }
          onHttpError={({ nativeEvent }: WebViewHttpErrorEvent) => {
            if (nativeEvent.statusCode >= 400) {
              setErrorMessage(`HTTP ${nativeEvent.statusCode}`);
            }
          }}
        />

        {errorMessage ? (
          <View pointerEvents="box-none" style={styles.errorOverlay}>
            <View
              style={[
                styles.errorCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather
                name="alert-circle"
                size={24}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.errorText, { color: colors.foreground }]}
                numberOfLines={3}
              >
                {errorMessage}
              </Text>
              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  ref.current?.reload();
                }}
                hitSlop={8}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.retryLabel, { color: colors.accent }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
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
  navCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  errorCard: {
    width: "100%",
    maxWidth: 360,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textAlign: "center",
  },
  retryLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginTop: 4,
  },
});
