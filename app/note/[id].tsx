import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { RichEditor } from "react-native-pell-rich-editor";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import {
  DrawingCanvas,
  type DrawingCanvasHandle,
  type DrawingTool,
} from "@/components/DrawingCanvas";
import {
  DrawingToolbar,
  PEN_COLORS,
  sizesForTool,
} from "@/components/DrawingToolbar";
import { RichTextToolbarV2 } from "@/components/RichTextToolbarV2";
import {
  useLibrary,
  type PenType,
  type Stroke,
} from "@/contexts/LibraryContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { exportNoteToPdf } from "@/lib/exportNotePdf";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AUTOSAVE_DELAY_MS = 600;
const INACTIVITY_DRAW_MS = 30_000;
const INACTIVITY_TEXT_MS = 45_000;
const MIN_SESSION_SEC = 5;

type Mode = "text" | "draw";

function stripHtml(s: string) {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function countWords(html: string) {
  const t = stripHtml(html).trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export default function NoteScreen() {
  const colors = useColors();
  const { effectiveMode } = useTheme();
  const drawBackground = effectiveMode === "dark" ? "#000000" : "#ffffff";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getNote,
    updateNote,
    deleteNote,
    loadNoteStrokes,
    saveNoteStrokes,
    flushNoteStrokes,
    recordSession,
  } = useLibrary();

  const note = id ? getNote(id) : undefined;

  const editorRef = useRef<RichEditor>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.contentHtml ?? "");
  const [strokes, setStrokes] = useState<Stroke[]>(note?.drawingStrokes ?? []);

  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [width, setWidth] = useState<number>(4);
  const [penType, setPenType] = useState<PenType>("ballpoint");

  const [bodySize, setBodySize] = useState({ w: 0, h: 0 });
  const [historyVersion, setHistoryVersion] = useState(0);
  const bumpHistory = useCallback(
    () => setHistoryVersion((v) => v + 1),
    [],
  );

  const initializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Session tracking ---
  const sessionStartRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());
  const [seconds, setSeconds] = useState(0);
  const [pausedSec, setPausedSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const modeRef = useRef<Mode>("text");
  modeRef.current = mode;

  // Output deltas, snapshot at mount.
  const initialWordsRef = useRef(0);
  const initialStrokesCountRef = useRef(0);
  const finalizedRef = useRef(false);

  // Live values for finalize() — refs avoid stale closures in the unmount cleanup.
  const titleRef = useRef("");
  const contentRef = useRef("");
  const strokesCountRef = useRef(0);
  const secondsRef = useRef(0);
  const pausedSecRef = useRef(0);
  titleRef.current = title;
  contentRef.current = content;
  strokesCountRef.current = strokes.length;
  secondsRef.current = seconds;
  pausedSecRef.current = pausedSec;

  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setPaused((p) => (p ? false : p));
  }, []);

  useEffect(() => {
    if (!note || initializedRef.current) return;
    setTitle(note.title);
    setContent(note.contentHtml);
    initializedRef.current = true;
    initialWordsRef.current = countWords(note.contentHtml);
    initialStrokesCountRef.current = note.drawingStrokes.length;
  }, [note]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    (async () => {
      try {
        const cached = await loadNoteStrokes(id);
        if (cancelled) return;
        setStrokes(cached);
      } catch {
        /* ignore — fall back to whatever's already in state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadNoteStrokes]);

  // 1 s ticker — count seconds in either focus or paused buckets.
  useEffect(() => {
    const t = setInterval(() => {
      if (paused) setPausedSec((v) => v + 1);
      else setSeconds((v) => v + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [paused]);

  // 5 s inactivity poll — pause if idle longer than the per-mode threshold.
  useEffect(() => {
    const t = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const threshold =
        modeRef.current === "draw" ? INACTIVITY_DRAW_MS : INACTIVITY_TEXT_MS;
      if (idle >= threshold) {
        setPaused((p) => (p ? p : true));
      }
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (!id) return;
    const durationSec = secondsRef.current;
    if (durationSec < MIN_SESSION_SEC) return;
    const wordsAdded = Math.max(
      0,
      countWords(contentRef.current) - initialWordsRef.current,
    );
    const strokesAdded = Math.max(
      0,
      strokesCountRef.current - initialStrokesCountRef.current,
    );
    const endedAt = Date.now();
    recordSession({
      materialId: null,
      noteId: id,
      startedAt: sessionStartRef.current,
      endedAt,
      durationSec,
      pausedSec: pausedSecRef.current,
      wordsAdded,
      strokesAdded,
    }).catch(() => {
      /* swallow — local copy already in cache via persistSessions */
    });
  }, [id, recordSession]);

  // Backstop: record on hard unmount (swipe-back, navigation pop) so a session
  // is captured even if onBack didn't run.
  //
  // Ref-stable: `finalize` re-memos whenever `recordSession` does, and using
  // `[finalize]` deps fires the cleanup on every re-memo — that flips
  // `finalizedRef.current` while the user is still editing, and the real
  // unmount silently no-ops.
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;
  useEffect(() => () => finalizeRef.current(), []);

  const flushTextSave = useCallback(
    async (patch: { title?: string; contentHtml?: string }) => {
      if (!id) return;
      try {
        await updateNote(id, patch);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not save.";
        Alert.alert("Save failed", msg);
      }
    },
    [id, updateNote],
  );

  const scheduleTextSave = useCallback(
    (patch: { title?: string; contentHtml?: string }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushTextSave(patch);
      }, AUTOSAVE_DELAY_MS);
    },
    [flushTextSave],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const onChangeTitle = (next: string) => {
    if (initializedRef.current) bumpActivity();
    setTitle(next);
    if (!initializedRef.current) return;
    scheduleTextSave({ title: next });
  };

  const onChangeContent = (html: string) => {
    if (initializedRef.current) bumpActivity();
    setContent(html);
    if (!initializedRef.current) return;
    scheduleTextSave({ contentHtml: html });
  };

  const onStrokesChange = useCallback(
    (next: Stroke[]) => {
      bumpActivity();
      setStrokes(next);
      bumpHistory();
      if (!id) return;
      saveNoteStrokes(id, next).catch(() => {
        /* keep local copy; saveNoteStrokes already retries on next save */
      });
    },
    [id, saveNoteStrokes, bumpHistory, bumpActivity],
  );

  const switchMode = useCallback(
    (next: Mode) => {
      bumpActivity();
      setMode(next);
    },
    [bumpActivity],
  );

  const onBack = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (initializedRef.current && id) {
        try {
          await updateNote(id, { title, contentHtml: content });
        } catch {
          /* don't block back nav */
        }
      }
    }
    if (id) {
      try {
        await flushNoteStrokes(id);
      } catch {
        /* don't block back nav */
      }
    }
    finalize();
    router.back();
  }, [router, id, title, content, updateNote, flushNoteStrokes, finalize]);

  const onDelete = () => {
    if (!id) return;
    const doDelete = async () => {
      try {
        await deleteNote(id);
        router.back();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not delete.";
        Alert.alert("Delete failed", msg);
      }
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert("Delete this note?", "This permanently removes the note.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const [exporting, setExporting] = useState(false);
  const onExportPdf = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Export PDF", "Available on iOS and Android.");
      return;
    }
    if (!note || !id || exporting) return;
    setExporting(true);
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        try {
          await updateNote(id, { title, contentHtml: content });
        } catch {
          /* keep going; export uses in-memory state */
        }
      }
      try {
        await flushNoteStrokes(id);
      } catch {
        /* keep going */
      }
      const uri = await exportNoteToPdf({
        title,
        contentHtml: content,
        drawingStrokes: strokes,
        createdAt: note.createdAt,
      });
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        Alert.alert("Sharing unavailable", `Saved to ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: title || "Note",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not export.";
      Alert.alert("Export failed", msg);
    } finally {
      setExporting(false);
    }
  }, [
    note,
    id,
    exporting,
    title,
    content,
    strokes,
    updateNote,
    flushNoteStrokes,
  ]);

  const onBodyLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBodySize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  };

  const onSwitchTool = (next: DrawingTool) => {
    setTool(next);
    const sizes = sizesForTool(next);
    if (!sizes.includes(width)) {
      setWidth(sizes[Math.min(1, sizes.length - 1)]);
    }
  };

  const undoCount = canvasRef.current?.canUndo() ? 1 : 0;
  const redoCount = canvasRef.current?.canRedo() ? 1 : 0;
  // Reference historyVersion so React re-evaluates undo/redo states.
  void historyVersion;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!note) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingTop: insets.top + 80 }]}>
          <Text style={{ color: colors.foreground }}>Note not found.</Text>
          <Button
            label="Back"
            onPress={() => router.back()}
            variant="ghost"
            style={{ marginTop: 12 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <HeaderIconButton
          icon="chevron-left"
          accessibilityLabel="Back"
          surface={colors.secondary}
          tint={colors.foreground}
          onPress={onBack}
        />

        <ModeSwitch
          mode={mode}
          onChange={switchMode}
          surface={colors.secondary}
          border={colors.border}
          active={colors.primary}
          activeText={colors.primaryForeground}
          idleText={colors.foreground}
        />

        <HeaderIconButton
          icon="share"
          accessibilityLabel="Export as PDF"
          surface={colors.secondary}
          tint={colors.foreground}
          onPress={onExportPdf}
          disabled={exporting}
        />

        <HeaderIconButton
          icon="trash-2"
          accessibilityLabel="Delete note"
          surface={colors.secondary}
          tint={colors.foreground}
          onPress={onDelete}
        />
      </View>

      {mode === "text" ? (
        <View style={[styles.titleRow, { paddingHorizontal: 20 }]}>
          <TextInput
            value={title}
            onChangeText={onChangeTitle}
            placeholder="Untitled"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.titleInput, { color: colors.foreground }]}
            returnKeyType="done"
          />
          {paused ? (
            <View
              style={[
                styles.pausedPill,
                { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}
            >
              <Feather
                name="pause"
                size={12}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  styles.pausedPillText,
                  { color: colors.mutedForeground },
                ]}
              >
                Paused
              </Text>
            </View>
          ) : null}
        </View>
      ) : paused ? (
        <View style={[styles.drawPausedRow, { paddingHorizontal: 20 }]}>
          <View
            style={[
              styles.pausedPill,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Feather name="pause" size={12} color={colors.mutedForeground} />
            <Text
              style={[
                styles.pausedPillText,
                { color: colors.mutedForeground },
              ]}
            >
              Paused
            </Text>
          </View>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.flex} onLayout={onBodyLayout}>
          {mode === "text" ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={{ paddingBottom: 96 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              {...(Platform.OS === "ios"
                ? { contentInsetAdjustmentBehavior: "automatic" as const }
                : {})}
            >
              <RichEditor
                ref={editorRef}
                initialContentHTML={note.contentHtml}
                placeholder="Start writing…"
                onChange={onChangeContent}
                style={styles.editor}
                initialHeight={360}
                useContainer
                editorStyle={{
                  backgroundColor: colors.background,
                  color: colors.foreground,
                  placeholderColor: colors.mutedForeground,
                  caretColor: colors.primary,
                  contentCSSText:
                    "padding: 4px 4px 24px 4px; line-height: 1.55; font-size: 16px;",
                }}
              />
            </ScrollView>
          ) : bodySize.w > 0 && bodySize.h > 0 ? (
            <DrawingCanvas
              ref={canvasRef}
              strokes={strokes}
              onStrokesChange={onStrokesChange}
              tool={tool}
              color={color}
              width={width}
              penType={penType}
              background={drawBackground}
              viewportWidth={bodySize.w}
              viewportHeight={bodySize.h}
            />
          ) : null}
        </View>

        <View
          style={{
            paddingBottom: insets.bottom,
          }}
        >
          {mode === "text" ? (
            <RichTextToolbarV2 editor={editorRef} />
          ) : (
            <DrawingToolbar
              tool={tool}
              color={color}
              width={width}
              penType={penType}
              onToolChange={onSwitchTool}
              onColorChange={setColor}
              onWidthChange={setWidth}
              onPenTypeChange={setPenType}
              onUndo={() => {
                canvasRef.current?.undo();
                bumpHistory();
              }}
              onRedo={() => {
                canvasRef.current?.redo();
                bumpHistory();
              }}
              canUndo={undoCount > 0}
              canRedo={redoCount > 0}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function HeaderIconButton({
  icon,
  accessibilityLabel,
  surface,
  tint,
  onPress,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  accessibilityLabel: string;
  surface: string;
  tint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const press = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.04 }],
  }));
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      }}
      hitSlop={10}
      style={[
        styles.iconBtn,
        {
          backgroundColor: surface,
          opacity: disabled ? 0.4 : 1,
        },
        animStyle,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <Feather name={icon} size={18} color={tint} />
    </AnimatedPressable>
  );
}

function ModeSwitch({
  mode,
  onChange,
  surface,
  border,
  active,
  activeText,
  idleText,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  surface: string;
  border: string;
  active: string;
  activeText: string;
  idleText: string;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(mode === "text" ? 0 : 1);
  useEffect(() => {
    progress.value = withSpring(mode === "text" ? 0 : 1, {
      damping: 18,
      stiffness: 220,
    });
  }, [mode, progress]);
  const pillStyle = useAnimatedStyle(() => {
    const halfMinusPad = trackWidth > 0 ? (trackWidth - 4) / 2 : 0;
    return {
      transform: [{ translateX: progress.value * halfMinusPad }],
      width: halfMinusPad,
    };
  });
  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        styles.modeSwitch,
        { backgroundColor: surface, borderColor: border },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.modePill,
          { backgroundColor: active },
          pillStyle,
        ]}
      />
      <ModeSeg
        label="Text"
        icon="type"
        isActive={mode === "text"}
        onPress={() => onChange("text")}
        idleText={idleText}
        activeText={activeText}
      />
      <ModeSeg
        label="Draw"
        icon="edit-3"
        isActive={mode === "draw"}
        onPress={() => onChange("draw")}
        idleText={idleText}
        activeText={activeText}
      />
    </View>
  );
}

function ModeSeg({
  label,
  icon,
  isActive,
  onPress,
  idleText,
  activeText,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  isActive: boolean;
  onPress: () => void;
  idleText: string;
  activeText: string;
}) {
  const press = useSharedValue(0);
  const colorProgress = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    colorProgress.value = withTiming(isActive ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [isActive, colorProgress]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.04 }],
  }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      }}
      style={[styles.modeSeg, animStyle]}
      accessibilityLabel={`${label} mode`}
    >
      <Feather name={icon} size={14} color={isActive ? activeText : idleText} />
      <Text
        style={[
          styles.modeSegText,
          { color: isActive ? activeText : idleText },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeSwitch: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 2,
    gap: 2,
    position: "relative",
    overflow: "hidden",
  },
  modePill: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 10,
  },
  modeSeg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  modeSegText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 12,
    gap: 10,
  },
  drawPausedRow: {
    flexDirection: "row",
    paddingBottom: 8,
  },
  pausedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  pausedPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  titleInput: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    letterSpacing: -0.6,
    paddingVertical: 8,
  },
  editor: {
    minHeight: 360,
    paddingHorizontal: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
});
