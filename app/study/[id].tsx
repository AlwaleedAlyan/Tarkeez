import { Feather } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { Button } from "@/components/Button";
import {
  type AnnotationsByPage,
  useLibrary,
} from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import { buildViewerHtml } from "@/lib/pdfViewerHtml";

const INACTIVITY_MS = 60 * 1000;
const DRAW_COLOR = "#dc4444";
const HIGHLIGHT_COLOR = "rgba(245,196,81,0.45)";

type Tool = "read" | "draw" | "highlight";
type PauseReason = null | "inactive" | "flick";

type ReaderMessage =
  | { type: "ready"; totalPages: number }
  | { type: "page"; page: number }
  | { type: "activity" }
  | { type: "flick"; active: boolean }
  | { type: "selection"; length: number }
  | {
      type: "annotations";
      page: number;
      strokes: AnnotationsByPage[string]["strokes"];
      highlights: AnnotationsByPage[string]["highlights"];
    }
  | { type: "error"; message: string };

function fmtClock(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function StudyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const exitToLibrary = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getMaterial,
    updateMaterial,
    recordSession,
    deleteMaterial,
    loadAnnotations,
    saveAnnotations,
    ensureLocalFile,
  } = useLibrary();

  const material = id ? getMaterial(id) : undefined;

  const [base64, setBase64] = useState<string | null>(null);
  const [initialAnnos, setInitialAnnos] = useState<AnnotationsByPage | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [pausedSec, setPausedSec] = useState(0);
  const [pauseReason, setPauseReason] = useState<PauseReason>(null);
  const [totalPages, setTotalPages] = useState<number | undefined>(
    material?.totalPages,
  );
  const [currentPage, setCurrentPage] = useState<number>(
    material?.currentPage ?? 1,
  );
  const [tool, setTool] = useState<Tool>("read");

  const startedAtRef = useRef<number>(Date.now());
  const startPageRef = useRef<number>(material?.currentPage ?? 1);
  const lastActivityRef = useRef<number>(Date.now());
  const flickRef = useRef<boolean>(false);
  const pageTimesRef = useRef<Record<number, number>>({});
  const selectionsRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);
  const currentPageRef = useRef<number>(material?.currentPage ?? 1);
  const annotationsRef = useRef<AnnotationsByPage>({});
  const annosDirtyRef = useRef<boolean>(false);
  const savedRef = useRef<boolean>(false);
  const webViewRef = useRef<WebView>(null);
  // Mirror these into refs so the unmount cleanup (which runs with []
  // deps) reads the latest values instead of the mount-time zeros.
  const secondsRef = useRef(0);
  secondsRef.current = seconds;
  const pausedSecRef = useRef(0);
  pausedSecRef.current = pausedSec;
  const totalPagesRef = useRef<number | undefined>(undefined);
  totalPagesRef.current = totalPages;
  // `material` is derived from a live query — undefined on the first render
  // if liveMaterials hasn't returned yet. Closing over the first-render value
  // (which we do with [] deps below) loses every session for the cold-launch
  // path. Mirror to a ref the cleanup can read at unmount time.
  const materialRef = useRef<typeof material>(material);
  materialRef.current = material;

  // Load PDF + annotations. Re-runs when loadAttempt increments (Retry button).
  useEffect(() => {
    let cancelled = false;
    if (!material) return;
    if (Platform.OS === "web") {
      setLoadError("PDF viewing requires Expo Go on a phone.");
      return;
    }
    setLoadError(null);
    (async () => {
      try {
        const localUri = await ensureLocalFile(material.id);
        const [b64, annos] = await Promise.all([
          FileSystem.readAsStringAsync(localUri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
          loadAnnotations(material.id),
        ]);
        if (cancelled) return;
        annotationsRef.current = annos;
        setInitialAnnos(annos);
        setBase64(b64);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Could not load PDF.";
          setLoadError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [material, loadAnnotations, ensureLocalFile, loadAttempt]);

  const isRunning = pauseReason === null;

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Single ticker that advances either focus seconds or paused seconds.
  useEffect(() => {
    const id = setInterval(() => {
      if (isRunningRef.current) {
        setSeconds((s) => s + 1);
        const p = currentPageRef.current;
        pageTimesRef.current[p] = (pageTimesRef.current[p] ?? 0) + 1;
      } else {
        setPausedSec((p) => p + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Inactivity watchdog
  useEffect(() => {
    const interval = setInterval(() => {
      if (flickRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= INACTIVITY_MS) {
        setPauseReason((cur) => (cur === null ? "inactive" : cur));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Debounced annotation save
  useEffect(() => {
    if (!material) return;
    const interval = setInterval(() => {
      if (annosDirtyRef.current) {
        annosDirtyRef.current = false;
        void saveAnnotations(material.id, annotationsRef.current);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [material, saveAnnotations]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: ReaderMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as ReaderMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "ready":
        setTotalPages(msg.totalPages);
        break;
      case "page":
        setCurrentPage(msg.page);
        lastActivityRef.current = Date.now();
        break;
      case "activity":
        lastActivityRef.current = Date.now();
        setPauseReason((cur) => (cur === "inactive" ? null : cur));
        break;
      case "flick":
        flickRef.current = msg.active;
        if (msg.active) {
          setPauseReason("flick");
        } else {
          lastActivityRef.current = Date.now();
          setPauseReason((cur) => (cur === "flick" ? null : cur));
        }
        break;
      case "selection":
        selectionsRef.current += 1;
        lastActivityRef.current = Date.now();
        setPauseReason((cur) => (cur === "inactive" ? null : cur));
        break;
      case "annotations":
        annotationsRef.current = {
          ...annotationsRef.current,
          [String(msg.page)]: { strokes: msg.strokes, highlights: msg.highlights },
        };
        annosDirtyRef.current = true;
        lastActivityRef.current = Date.now();
        setPauseReason((cur) => (cur === "inactive" ? null : cur));
        break;
      case "error":
        setLoadError(msg.message || "PDF failed to load.");
        break;
    }
  }, []);

  const sendToWebView = useCallback((js: string) => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(`(function(){try{${js}}catch(e){}})();true;`);
  }, []);

  const onPickTool = useCallback(
    (next: Tool) => {
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
      setTool(next);
      sendToWebView(`window.__tarkeezSetTool && window.__tarkeezSetTool(${JSON.stringify(next)});`);
    },
    [sendToWebView],
  );

  const onClearPage = useCallback(() => {
    const doClear = () => {
      sendToWebView(
        `var p = window.__tarkeezGetCurrentPage && window.__tarkeezGetCurrentPage();
         if (p && window.__tarkeezClearPage) window.__tarkeezClearPage(p);`,
      );
    };
    if (Platform.OS === "web") {
      doClear();
    } else {
      Alert.alert(
        "Clear page?",
        "This removes drawings and highlights on the current page.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear", style: "destructive", onPress: doClear },
        ],
      );
    }
  }, [sendToWebView]);

  const saveAndExit = useCallback(async () => {
    if (savedRef.current || !material) {
      exitToLibrary();
      return;
    }
    savedRef.current = true;
    const endedAt = Date.now();
    const pagesRead = Math.max(0, currentPage - startPageRef.current);

    try {
      // Always flush annotations
      await saveAnnotations(material.id, annotationsRef.current);

      if (seconds < 5 && pagesRead === 0 && selectionsRef.current === 0) {
        exitToLibrary();
        return;
      }

      await Promise.all([
        updateMaterial(material.id, {
          currentPage,
          totalPages: totalPages ?? material.totalPages,
        }),
        recordSession({
          materialId: material.id,
          noteId: null,
          startedAt: startedAtRef.current,
          endedAt,
          durationSec: seconds,
          pausedSec,
          pagesRead,
          pageTimes: { ...pageTimesRef.current },
          selections: selectionsRef.current,
        }),
      ]);
    } finally {
      exitToLibrary();
    }
  }, [
    material,
    currentPage,
    seconds,
    pausedSec,
    totalPages,
    recordSession,
    updateMaterial,
    saveAnnotations,
    exitToLibrary,
  ]);

  // Unmount safety net — reads through refs because [] deps means the
  // cleanup closes over mount-time state. Using closure `seconds`/`material`
  // would see 0 / undefined (when liveMaterials hadn't returned yet) and
  // silently skip the recordSession call.
  useEffect(() => {
    return () => {
      const m = materialRef.current;
      if (savedRef.current || !m) return;
      const endedAt = Date.now();
      const sec = secondsRef.current;
      const paused = pausedSecRef.current;
      const page = currentPageRef.current;
      const pagesRead = Math.max(0, page - startPageRef.current);
      void saveAnnotations(m.id, annotationsRef.current);
      if (sec < 5 && pagesRead === 0 && selectionsRef.current === 0) return;
      savedRef.current = true;
      void recordSession({
        materialId: m.id,
        noteId: null,
        startedAt: startedAtRef.current,
        endedAt,
        durationSec: sec,
        pausedSec: paused,
        pagesRead,
        pageTimes: { ...pageTimesRef.current },
        selections: selectionsRef.current,
      });
      void updateMaterial(m.id, {
        currentPage: page,
        totalPages: totalPagesRef.current ?? m.totalPages,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = () => {
    if (!material) return;
    const doDelete = async () => {
      savedRef.current = true;
      await deleteMaterial(material.id);
      exitToLibrary();
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert("Delete material?", "This removes the PDF and its sessions.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const status = useMemo(() => {
    if (pauseReason === "flick")
      return {
        text: "Paused — slow down",
        sub: "It looks like you're flicking through pages.",
        color: colors.accent,
      };
    if (pauseReason === "inactive")
      return {
        text: "Paused — no activity",
        sub: "Tap or scroll to resume.",
        color: colors.mutedForeground,
      };
    return {
      text: "Reading",
      sub: totalPages
        ? `Page ${currentPage} of ${totalPages}`
        : `Page ${currentPage}`,
      color: "#5fb37b",
    };
  }, [pauseReason, currentPage, totalPages, colors]);

  const focusPct = useMemo(() => {
    const wall = seconds + pausedSec;
    if (wall === 0) return 100;
    return Math.round((seconds / wall) * 100);
  }, [seconds, pausedSec]);

  const html = useMemo(() => {
    if (!base64 || initialAnnos === null) return null;
    return buildViewerHtml({
      pdfBase64: base64,
      startPage: startPageRef.current,
      annotations: initialAnnos,
      drawColor: DRAW_COLOR,
      highlightColor: HIGHLIGHT_COLOR,
    });
  }, [base64, initialAnnos]);

  if (!material) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingTop: insets.top + 80 }]}>
          <Text style={{ color: colors.foreground }}>Material not found.</Text>
          <Button
            label="Go back"
            onPress={exitToLibrary}
            variant="ghost"
            style={{ marginTop: 12 }}
          />
        </View>
      </View>
    );
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 16 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: "#1a1a2e" }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Tappable
          onPress={saveAndExit}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: "rgba(250,247,242,0.12)",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Feather name="x" size={20} color="#faf7f2" />
        </Tappable>

        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {material.title}
          </Text>
          <View style={styles.headerStatusRow}>
            <View style={[styles.dot, { backgroundColor: status.color }]} />
            <Text style={styles.headerStatus}>{status.text}</Text>
            <Text style={styles.headerSep}>·</Text>
            <Text style={styles.headerClock}>{fmtClock(seconds)}</Text>
            <Text style={styles.headerSep}>·</Text>
            <Text style={styles.headerPct}>{focusPct}%</Text>
          </View>
        </View>

        <Tappable
          onPress={onDelete}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: "rgba(250,247,242,0.12)",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={18} color="#faf7f2" />
        </Tappable>
      </View>

      <View style={styles.viewerWrap}>
        {loadError ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={32} color="#faf7f2" />
            <Text style={styles.errorTitle}>Could not open this PDF</Text>
            <Text style={styles.errorMsg}>{loadError}</Text>
            <View
              style={{ flexDirection: "row", gap: 12, marginTop: 16 }}
            >
              <Button
                label="Retry"
                onPress={() => {
                  setBase64(null);
                  setLoadError(null);
                  setLoadAttempt((n) => n + 1);
                }}
              />
              <Button
                label="Go back"
                onPress={exitToLibrary}
                variant="ghost"
              />
            </View>
          </View>
        ) : !html ? (
          <View style={styles.center}>
            <ActivityIndicator color="#faf7f2" />
            <Text style={styles.loadingText}>Preparing your PDF…</Text>
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            allowsLinkPreview={false}
            mixedContentMode="always"
            scalesPageToFit
            style={{ backgroundColor: "#1a1a2e" }}
            startInLoadingState={false}
            setSupportMultipleWindows={false}
          />
        )}
      </View>

      {html && !loadError ? (
        <View
          style={[
            styles.toolbarWrap,
            { bottom: bottomPad + (pauseReason !== null ? 64 : 16) },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.toolbar}>
            <ToolButton
              active={tool === "read"}
              icon="mouse-pointer"
              label="Read"
              onPress={() => onPickTool("read")}
            />
            <ToolButton
              active={tool === "draw"}
              icon="edit-2"
              label="Draw"
              onPress={() => onPickTool("draw")}
              activeColor={DRAW_COLOR}
            />
            <ToolButton
              active={tool === "highlight"}
              icon="bookmark"
              label="Mark"
              onPress={() => onPickTool("highlight")}
              activeColor="#f5c451"
            />
            <View style={styles.toolDivider} />
            <Tappable
              onPress={onClearPage}
              style={({ pressed }) => [
                styles.toolBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="trash" size={16} color="#faf7f2" />
            </Tappable>
          </View>
          {tool === "draw" ? (
            <Text style={styles.toolHint}>One finger draws · pinch zoom in Read mode</Text>
          ) : tool === "highlight" ? (
            <Text style={styles.toolHint}>Select text to highlight</Text>
          ) : null}
        </View>
      ) : null}

      {pauseReason !== null && !loadError && html ? (
        <View
          style={[
            styles.pauseBanner,
            {
              bottom: bottomPad + 16,
              backgroundColor:
                pauseReason === "flick" ? colors.accent : "rgba(250,247,242,0.95)",
            },
          ]}
        >
          <Feather
            name={pauseReason === "flick" ? "wind" : "moon"}
            size={16}
            color="#1a1a2e"
          />
          <Text style={styles.pauseText}>{status.sub}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ToolButton({
  active,
  icon,
  label,
  onPress,
  activeColor,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  activeColor?: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolBtn,
        {
          backgroundColor: active
            ? activeColor ?? "rgba(250,247,242,0.18)"
            : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Feather
        name={icon}
        size={15}
        color={active && activeColor ? "#1a1a2e" : "#faf7f2"}
      />
      <Text
        style={[
          styles.toolLabel,
          { color: active && activeColor ? "#1a1a2e" : "#faf7f2" },
        ]}
      >
        {label}
      </Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  headerCenter: { flex: 1, alignItems: "center", gap: 4 },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#faf7f2",
    maxWidth: "90%",
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  headerStatus: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "rgba(250,247,242,0.75)",
  },
  headerSep: {
    color: "rgba(250,247,242,0.4)",
    fontSize: 11,
  },
  headerClock: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: "#faf7f2",
    fontVariant: ["tabular-nums"],
  },
  headerPct: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#d4a574",
    fontVariant: ["tabular-nums"],
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerWrap: { flex: 1 },
  loadingText: {
    fontFamily: "Inter_500Medium",
    color: "#faf7f2",
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    fontFamily: "Inter_600SemiBold",
    color: "#faf7f2",
    fontSize: 16,
    marginTop: 12,
  },
  errorMsg: {
    fontFamily: "Inter_400Regular",
    color: "rgba(250,247,242,0.7)",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  toolbarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(26,26,46,0.92)",
    borderColor: "rgba(250,247,242,0.12)",
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 22,
    minHeight: 36,
  },
  toolLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  toolDivider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(250,247,242,0.18)",
    marginHorizontal: 4,
  },
  toolHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "rgba(250,247,242,0.65)",
    backgroundColor: "rgba(26,26,46,0.85)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
  pauseBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pauseText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#1a1a2e",
    flex: 1,
  },
});
