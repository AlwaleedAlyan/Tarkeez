import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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

const AUTOSAVE_DELAY_MS = 600;
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

export default function NoteScreenWeb() {
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

  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

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
  const editorHydratedRef = useRef(false);

  // Session metrics.
  const sessionStartRef = useRef<number>(Date.now());
  const finalizedRef = useRef(false);
  const initialWordsRef = useRef(0);
  const initialStrokesCountRef = useRef(0);
  const keystrokesRef = useRef(0);
  const lastTextLenRef = useRef(0);

  const titleRef = useRef("");
  const contentRef = useRef("");
  const strokesCountRef = useRef(0);
  titleRef.current = title;
  contentRef.current = content;
  strokesCountRef.current = strokes.length;

  useEffect(() => {
    if (!note || initializedRef.current) return;
    setTitle(note.title);
    setContent(note.contentHtml);
    initializedRef.current = true;
    initialWordsRef.current = countWords(note.contentHtml);
    initialStrokesCountRef.current = note.drawingStrokes.length;
    lastTextLenRef.current = stripHtml(note.contentHtml).length;
  }, [note]);

  // Hydrate the contentEditable div once we have the initial content.
  useEffect(() => {
    if (!editorRef.current || editorHydratedRef.current) return;
    if (!initializedRef.current && !note) return;
    editorRef.current.innerHTML = content || "";
    editorHydratedRef.current = true;
  }, [content, note]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    (async () => {
      try {
        const cached = await loadNoteStrokes(id);
        if (cancelled) return;
        setStrokes(cached);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadNoteStrokes]);

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
    }
    setTitle(next);
    if (!initializedRef.current) return;
    scheduleTextSave({ title: next });
  };

  const onEditorInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    if (initializedRef.current) {
      const newLen = stripHtml(html).length;
      const delta = Math.abs(newLen - lastTextLenRef.current);
      keystrokesRef.current += delta;
      lastTextLenRef.current = newLen;
    }
    setContent(html);
    if (!initializedRef.current) return;
    scheduleTextSave({ contentHtml: html });
  }, [scheduleTextSave]);

  const applyEditorAction = useCallback(
    (action: string, value?: string) => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      try {
        document.execCommand(action, false, value);
      } catch {
        /* ignore */
      }
      onEditorInput();
    },
    [onEditorInput],
  );

  const onStrokesChange = useCallback(
    (next: Stroke[]) => {
      setStrokes(next);
      bumpHistory();
      if (!id) return;
      saveNoteStrokes(id, next).catch(() => {
        /* keep local copy */
      });
    },
    [id, saveNoteStrokes, bumpHistory],
  );

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
  }, []);

  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (!id) return;
    const durationSec = Math.round(
      (Date.now() - sessionStartRef.current) / 1000,
    );
    if (durationSec < MIN_SESSION_SEC) return;
    const wordsAdded = Math.max(
      0,
      countWords(contentRef.current) - initialWordsRef.current,
    );
    const strokesAdded = Math.max(
      0,
      strokesCountRef.current - initialStrokesCountRef.current,
    );
    recordSession({
      materialId: null,
      noteId: id,
      startedAt: sessionStartRef.current,
      endedAt: Date.now(),
      durationSec,
      pausedSec: 0,
      wordsAdded,
      keystrokes: keystrokesRef.current,
      strokesAdded,
    }).catch(() => {
      /* swallow */
    });
  }, [id, recordSession]);

  useEffect(() => {
    return () => {
      finalize();
    };
  }, [finalize]);

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
    if (
      typeof window !== "undefined" &&
      typeof window.confirm === "function"
    ) {
      if (window.confirm("Delete this note? This permanently removes it.")) {
        doDelete();
      }
    } else {
      doDelete();
    }
  };

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
  void historyVersion;

  const topPad = Math.max(insets.top, 12);

  const showPlaceholder = useMemo(
    () => stripHtml(content).trim().length === 0,
    [content],
  );

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
            {
              backgroundColor: colors.secondary,
              borderColor: colors.border,
            },
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
        </View>
      ) : null}

      <View style={styles.flex} onLayout={onBodyLayout}>
        {mode === "text" ? (
          <View style={styles.editorWrap}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={onEditorInput}
              onBlur={() => {
                if (saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                  flushTextSave({ contentHtml: content });
                }
              }}
              style={{
                flex: 1,
                minHeight: "100%",
                width: "100%",
                outline: "none",
                padding: "12px 16px",
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 1.55,
                fontFamily:
                  "-apple-system, system-ui, 'Helvetica Neue', sans-serif",
                overflowY: "auto",
                boxSizing: "border-box",
              }}
            />
            {showPlaceholder ? (
              <View style={styles.placeholderOverlay} pointerEvents="none">
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 15,
                  }}
                >
                  Start writing…
                </Text>
              </View>
            ) : null}
          </View>
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
          <TextToolbar onAction={applyEditorAction} />
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

type ToolbarAction =
  | { kind: "exec"; action: string; value?: string }
  | { kind: "block"; tag: "h1" | "h2" };

const TOOLBAR_ITEMS: {
  key: string;
  label?: string;
  icon?: keyof typeof Feather.glyphMap;
  action: ToolbarAction;
  accessibilityLabel: string;
}[] = [
  {
    key: "bold",
    icon: "bold",
    action: { kind: "exec", action: "bold" },
    accessibilityLabel: "Bold",
  },
  {
    key: "italic",
    icon: "italic",
    action: { kind: "exec", action: "italic" },
    accessibilityLabel: "Italic",
  },
  {
    key: "underline",
    icon: "underline",
    action: { kind: "exec", action: "underline" },
    accessibilityLabel: "Underline",
  },
  {
    key: "h1",
    label: "H1",
    action: { kind: "block", tag: "h1" },
    accessibilityLabel: "Heading 1",
  },
  {
    key: "h2",
    label: "H2",
    action: { kind: "block", tag: "h2" },
    accessibilityLabel: "Heading 2",
  },
  {
    key: "ul",
    icon: "list",
    action: { kind: "exec", action: "insertUnorderedList" },
    accessibilityLabel: "Bulleted list",
  },
  {
    key: "ol",
    icon: "hash",
    action: { kind: "exec", action: "insertOrderedList" },
    accessibilityLabel: "Numbered list",
  },
];

function TextToolbar({
  onAction,
}: {
  onAction: (action: string, value?: string) => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.textToolbar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      ]}
    >
      {TOOLBAR_ITEMS.map((item) => {
        const fire = () => {
          if (item.action.kind === "exec") {
            onAction(item.action.action, item.action.value);
          } else {
            onAction("formatBlock", `<${item.action.tag}>`);
          }
        };
        return (
          <Pressable
            key={item.key}
            // Prevent focus theft so the contentEditable keeps its selection.
            // @ts-expect-error react-native-web forwards this to the DOM.
            onMouseDown={(e: { preventDefault: () => void }) =>
              e.preventDefault()
            }
            onPress={fire}
            style={({ pressed }) => [
              styles.textBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityLabel={item.accessibilityLabel}
          >
            {item.icon ? (
              <Feather name={item.icon} size={18} color={colors.foreground} />
            ) : (
              <Text
                style={{
                  color: colors.foreground,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {item.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// Reference Platform to avoid unused-import noise in this file's mixed RN/DOM JSX.
void Platform;

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
  titleInput: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.4,
    paddingVertical: 4,
  },
  editorWrap: {
    flex: 1,
    position: "relative",
  },
  placeholderOverlay: {
    position: "absolute",
    top: 12,
    left: 16,
  },
  textToolbar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingHorizontal: 8,
    gap: 4,
  },
  textBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
});
