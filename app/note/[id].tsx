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
import {
  RichEditor,
  RichToolbar,
  actions,
} from "react-native-pell-rich-editor";
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
import { useLibrary, type Stroke } from "@/contexts/LibraryContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { exportNoteToPdf } from "@/lib/exportNotePdf";

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
  const keystrokesRef = useRef(0);
  const lastTextLenRef = useRef(0);
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
    lastTextLenRef.current = stripHtml(note.contentHtml).length;
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
      keystrokes: keystrokesRef.current,
      strokesAdded,
    }).catch(() => {
      /* swallow — local copy already in cache via persistSessions */
    });
  }, [id, recordSession]);

  // Backstop: record on hard unmount (swipe-back, navigation pop) so a session
  // is captured even if onBack didn't run.
  useEffect(() => {
    return () => {
      finalize();
    };
  }, [finalize]);

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
    if (initializedRef.current) {
      const delta = Math.abs(next.length - title.length);
      keystrokesRef.current += delta;
      bumpActivity();
    }
    setTitle(next);
    if (!initializedRef.current) return;
    scheduleTextSave({ title: next });
  };

  const onChangeContent = (html: string) => {
    if (initializedRef.current) {
      const newLen = stripHtml(html).length;
      const delta = Math.abs(newLen - lastTextLenRef.current);
      keystrokesRef.current += delta;
      lastTextLenRef.current = newLen;
      bumpActivity();
    }
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
        <Pressable
          onPress={onBack}
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

        <View
          style={[
            styles.modeSwitch,
            { backgroundColor: colors.secondary, borderColor: colors.border },
          ]}
        >
          <ModeSegment
            label="Text"
            icon="type"
            active={mode === "text"}
            onPress={() => switchMode("text")}
            colors={colors}
          />
          <ModeSegment
            label="Draw"
            icon="edit-3"
            active={mode === "draw"}
            onPress={() => switchMode("draw")}
            colors={colors}
          />
        </View>

        <Pressable
          onPress={onExportPdf}
          hitSlop={10}
          disabled={exporting}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.secondary,
              opacity: exporting ? 0.4 : pressed ? 0.6 : 1,
            },
          ]}
          accessibilityLabel="Export as PDF"
        >
          <Feather name="share" size={18} color={colors.foreground} />
        </Pressable>

        <Pressable
          onPress={onDelete}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityLabel="Delete note"
        >
          <Feather name="trash-2" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {mode === "text" ? (
        <View style={[styles.titleRow, { paddingHorizontal: 16 }]}>
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
        <View style={[styles.drawPausedRow, { paddingHorizontal: 16 }]}>
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
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
            >
              <RichEditor
                ref={editorRef}
                initialContentHTML={note.contentHtml}
                placeholder="Start writing…"
                onChange={onChangeContent}
                style={styles.editor}
                initialHeight={320}
                useContainer
                editorStyle={{
                  backgroundColor: colors.background,
                  color: colors.foreground,
                  placeholderColor: colors.mutedForeground,
                  caretColor: colors.primary,
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
              background={drawBackground}
              viewportWidth={bodySize.w}
              viewportHeight={bodySize.h}
            />
          ) : null}
        </View>

        <View
          style={{
            backgroundColor: colors.card,
            paddingBottom: insets.bottom,
          }}
        >
          {mode === "text" ? (
            <RichToolbar
              editor={editorRef}
              actions={[
                actions.undo,
                actions.redo,
                actions.setBold,
                actions.setItalic,
                actions.setUnderline,
                actions.heading1,
                actions.heading2,
                actions.insertBulletsList,
                actions.insertOrderedList,
                actions.checkboxList,
              ]}
              iconMap={{
                [actions.heading1]: ({
                  tintColor,
                }: {
                  tintColor: string;
                }) => (
                  <Text style={{ color: tintColor, fontWeight: "700" }}>
                    H1
                  </Text>
                ),
                [actions.heading2]: ({
                  tintColor,
                }: {
                  tintColor: string;
                }) => (
                  <Text style={{ color: tintColor, fontWeight: "700" }}>
                    H2
                  </Text>
                ),
              }}
              style={[
                styles.richToolbar,
                {
                  backgroundColor: colors.card,
                  borderTopColor: colors.border,
                },
              ]}
              iconTint={colors.foreground}
              selectedIconTint={colors.primary}
            />
          ) : (
            <DrawingToolbar
              tool={tool}
              color={color}
              width={width}
              onToolChange={onSwitchTool}
              onColorChange={setColor}
              onWidthChange={setWidth}
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

function ModeSegment({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeSeg,
        {
          backgroundColor: active ? colors.primary : "transparent",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessibilityLabel={`${label} mode`}
    >
      <Feather
        name={icon}
        size={14}
        color={active ? colors.primaryForeground : colors.foreground}
      />
      <Text
        style={[
          styles.modeSegText,
          {
            color: active ? colors.primaryForeground : colors.foreground,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
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
  },
  modeSeg: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modeSegText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    fontSize: 22,
    letterSpacing: -0.4,
    paddingVertical: 4,
  },
  editor: {
    minHeight: 320,
    paddingHorizontal: 8,
  },
  richToolbar: {
    height: 48,
    borderTopWidth: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
});
