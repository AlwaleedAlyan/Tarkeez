import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { CollectionCard } from "@/components/CollectionCard";
import {
  CollectionPickerModal,
  type PickerTarget,
} from "@/components/CollectionPickerModal";
import {
  DraggableCard,
  type DragBeginInfo,
} from "@/components/DraggableCard";
import { EmptyState } from "@/components/EmptyState";
import { MaterialCard } from "@/components/MaterialCard";
import { NameInputModal } from "@/components/NameInputModal";
import { NoteCard } from "@/components/NoteCard";
import { Toast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLibrary,
  type Collection,
  type Material,
  type Note,
} from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { MAX_MATERIAL_BYTES } from "@/lib/api";

type LibraryItem =
  | { kind: "material"; createdAt: number; m: Material }
  | { kind: "note"; createdAt: number; n: Note };

type DragSubject =
  | { kind: "material"; m: Material }
  | { kind: "note"; n: Note };

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    collections,
    uncategorizedMaterials,
    uncategorizedNotes,
    materialsInCollection,
    notesInCollection,
    sessions,
    addMaterial,
    deleteMaterial,
    createCollection,
    updateCollection,
    createNote,
    deleteNote,
    updateNote,
    addNoteToCollection,
    addMaterialToCollection,
    refreshAll,
  } = useLibrary();
  const { refreshing, onRefresh } = usePullToRefresh(refreshAll);
  const [importing, setImporting] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [renamingNote, setRenamingNote] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [itemMenuTarget, setItemMenuTarget] = useState<{
    kind: "material" | "note";
    id: string;
    title: string;
  } | null>(null);

  const { width: windowWidth } = useWindowDimensions();
  // Matches the list's contentContainerStyle paddingHorizontal: 20.
  const overlayWidth = windowWidth - 40;

  // --- Long-press drag-to-collection state ---
  const [dragItem, setDragItem] = useState<
    (DragSubject & { startX: number; startY: number }) | null
  >(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dropPulse, setDropPulse] = useState<{ id: string; count: number }>({
    id: "",
    count: 0,
  });
  const [toast, setToast] = useState<string | null>(null);

  const dragTx = useSharedValue(0);
  const dragTy = useSharedValue(0);
  // 0 while lifting/dragging, animates to 1 for the drop (shrink + fade).
  const dropAnim = useSharedValue(0);

  const collectionRefs = useRef(new Map<string, View>());
  const collectionBounds = useRef<
    { id: string; x: number; y: number; w: number; h: number }[]
  >([]);
  const highlightedRef = useRef<string | null>(null);
  // Guards the card's own Pressable: after a long-press activates, the
  // release must not also trigger onPress (mainly a react-native-web
  // concern, where RNGH doesn't cancel RNW's responder).
  const suppressTapRef = useRef(false);

  const hitTestCollection = (absX: number, absY: number): string | null => {
    for (const b of collectionBounds.current) {
      if (
        absX >= b.x &&
        absX <= b.x + b.w &&
        absY >= b.y &&
        absY <= b.y + b.h
      ) {
        return b.id;
      }
    }
    return null;
  };

  const setHighlight = (id: string | null) => {
    if (id === highlightedRef.current) return;
    highlightedRef.current = id;
    setHighlightedId(id);
  };

  const clearDrag = () => {
    setDragItem(null);
    setHighlight(null);
    dropAnim.value = 0;
    suppressTapRef.current = false;
  };

  const onCardLongPressStart = () => {
    suppressTapRef.current = true;
  };

  const onCardMenuLongPress = (openMenu: () => void) => {
    suppressTapRef.current = true;
    openMenu();
    setTimeout(() => {
      suppressTapRef.current = false;
    }, 400);
  };

  const onCardDragBegin = (subject: DragSubject, info: DragBeginInfo) => {
    setDragItem({ ...subject, startX: info.startX, startY: info.startY });
    // Scrolling is disabled while dragging, so bounds stay valid for the
    // whole gesture.
    collectionBounds.current = [];
    collectionRefs.current.forEach((ref, id) => {
      ref.measureInWindow((x, y, w, h) => {
        collectionBounds.current.push({ id, x, y, w, h });
      });
    });
  };

  const onCardDragMove = (absX: number, absY: number) => {
    setHighlight(hitTestCollection(absX, absY));
  };

  const commitDrop = async (subject: DragSubject, collectionId: string) => {
    const name =
      collections.find((c) => c.id === collectionId)?.name ?? "collection";
    try {
      if (subject.kind === "note") {
        await addNoteToCollection(subject.n.id, collectionId);
      } else {
        await addMaterialToCollection(subject.m.id, collectionId);
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
      setDropPulse((p) => ({ id: collectionId, count: p.count + 1 }));
      setToast(`Added to ${name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add.";
      Alert.alert("Add to collection failed", msg);
    }
    clearDrag();
  };

  const onCardDragEnd = (
    subject: DragSubject,
    absX: number,
    absY: number,
  ) => {
    const targetId = hitTestCollection(absX, absY);
    setHighlight(null);
    if (targetId) {
      // Fly into the collection: shrink + fade toward the target's center.
      const b = collectionBounds.current.find((c) => c.id === targetId);
      if (!b) {
        // Bounds not measured yet (extremely fast drag): commit directly.
        commitDrop(subject, targetId);
        return;
      }
      dropAnim.value = withTiming(1, { duration: 240 });
      dragTx.value = withTiming(b.x + b.w / 2 - overlayWidth / 2, {
        duration: 240,
      });
      dragTy.value = withTiming(b.y + b.h / 2 - 44, { duration: 240 }, () => {
        runOnJS(commitDrop)(subject, targetId);
      });
    } else {
      // Snap back to the original slot; nothing changes.
      dragTx.value = withTiming(dragItem?.startX ?? absX, { duration: 220 });
      dragTy.value = withTiming(dragItem?.startY ?? absY, { duration: 220 }, () => {
        runOnJS(clearDrag)();
      });
    }
  };

  const dragOverlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTx.value },
      { translateY: dragTy.value },
      { scale: 1.04 * (1 - dropAnim.value) + 0.2 * dropAnim.value },
    ],
    opacity: 1 - dropAnim.value,
    shadowOpacity: 0.16,
    elevation: 12,
  }));

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : insets.bottom + 80;

  const onPickPdf = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileName = asset.name ?? "document.pdf";

      if (typeof asset.size === "number" && asset.size > MAX_MATERIAL_BYTES) {
        const sizeMb = (asset.size / (1024 * 1024)).toFixed(1);
        Alert.alert(
          "File too large",
          `This PDF is ${sizeMb} MB. Materials must be 15 MB or less.`,
        );
        return;
      }

      const m = await addMaterial({
        title: fileName.replace(/\.pdf$/i, ""),
        fileUri: asset.uri,
        fileName,
        mimeType: asset.mimeType ?? "application/pdf",
      });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
      }
      router.push(`/study/${m.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not import PDF.";
      // expo-document-picker throws this when a previous picker was dismissed
      // by navigating away rather than cancelling. The native presentation
      // count is stuck; user just needs to try again. Treat it as a soft retry.
      if (/different document picker.*already in progress|already in progress/i.test(msg)) {
        Alert.alert(
          "Picker busy",
          "A file picker is still open in the background. Tap import again.",
        );
        return;
      }
      Alert.alert("Import failed", msg);
    } finally {
      setImporting(false);
    }
  };

  const onCreateNote = async () => {
    if (creatingNote) return;
    setCreatingNote(true);
    try {
      const n = await createNote();
      router.push(`/note/${n.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create note.";
      Alert.alert("Create failed", msg);
    } finally {
      setCreatingNote(false);
    }
  };

  const openAddMenu = () => setAddMenuOpen(true);

  const runFromMenu = (action: () => void) => {
    setAddMenuOpen(false);
    // Wait for the modal exit animation to finish before presenting a native
    // picker — iOS rejects a second view-controller presentation while one is
    // still dismissing, which leaves DocumentPicker in an "already in
    // progress" state on subsequent taps.
    setTimeout(action, 350);
  };

  const onCreateCollection = async (name: string) => {
    try {
      await createCollection(name);
      setNameModalOpen(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not create collection.";
      Alert.alert("Create failed", msg);
    }
  };

  const onRenameCollection = async (name: string) => {
    if (!editingCollection) return;
    try {
      await updateCollection(editingCollection.id, name);
      setEditingCollection(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not rename.";
      Alert.alert("Rename failed", msg);
    }
  };

  const onRenameNote = async (name: string) => {
    if (!renamingNote) return;
    try {
      await updateNote(renamingNote.id, { title: name });
      setRenamingNote(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not rename.";
      Alert.alert("Rename failed", msg);
    }
  };

  const onMaterialMenu = (materialId: string, title: string) => {
    if (Platform.OS === "web") {
      setItemMenuTarget({ kind: "material", id: materialId, title });
      return;
    }
    Alert.alert(title, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add to collection…",
        onPress: () =>
          setPickerTarget({ kind: "material", id: materialId }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDeleteMaterial(materialId, title),
      },
    ]);
  };

  const confirmDeleteMaterial = (materialId: string, title: string) => {
    const doDelete = async () => {
      try {
        await deleteMaterial(materialId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not delete.";
        Alert.alert("Delete failed", msg);
      }
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert(`Delete "${title}"?`, "This removes the PDF and its sessions.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const onNoteMenu = (noteId: string, title: string) => {
    if (Platform.OS === "web") {
      setItemMenuTarget({ kind: "note", id: noteId, title });
      return;
    }
    Alert.alert(title || "Untitled", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rename",
        onPress: () => setRenamingNote({ id: noteId, title }),
      },
      {
        text: "Add to collection…",
        onPress: () => setPickerTarget({ kind: "note", id: noteId }),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDeleteNote(noteId, title),
      },
    ]);
  };

  const confirmDeleteNote = (noteId: string, title: string) => {
    const doDelete = async () => {
      try {
        await deleteNote(noteId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not delete.";
        Alert.alert("Delete failed", msg);
      }
    };
    const label = title || "Untitled";
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert(`Delete "${label}"?`, "This permanently removes the note.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const items: LibraryItem[] = useMemo(() => {
    const merged: LibraryItem[] = [
      ...uncategorizedMaterials.map((m) => ({
        kind: "material" as const,
        createdAt: m.createdAt,
        m,
      })),
      ...uncategorizedNotes.map((n) => ({
        kind: "note" as const,
        createdAt: n.createdAt,
        n,
      })),
    ];
    merged.sort((a, b) => b.createdAt - a.createdAt);
    return merged;
  }, [uncategorizedMaterials, uncategorizedNotes]);

  const showEmptyState =
    collections.length === 0 &&
    uncategorizedMaterials.length === 0 &&
    uncategorizedNotes.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.FlatList
        data={items}
        keyExtractor={(item) =>
          item.kind === "material" ? `material-${item.m.id}` : `note-${item.n.id}`
        }
        scrollEnabled={!dragItem}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        itemLayoutAnimation={LinearTransition.springify()
          .damping(22)
          .stiffness(180)}
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: bottomPad,
          paddingHorizontal: 20,
          gap: 12,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.greeting, { color: colors.mutedForeground }]}
                >
                  {user ? `Hello, ${user.name.split(" ")[0]}` : "Hello"}
                </Text>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  Your library
                </Text>
              </View>
              <Tappable
                onPress={openAddMenu}
                disabled={importing}
                style={({ pressed }) => [
                  styles.addButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: importing ? 0.6 : pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  },
                ]}
              >
                <Feather
                  name="plus"
                  size={22}
                  color={colors.primaryForeground}
                />
              </Tappable>
            </View>

            {collections.length > 0 ? (
              <View style={styles.collectionsBlock}>
                <Text
                  style={[styles.sectionLabel, { color: colors.mutedForeground }]}
                >
                  Collections
                </Text>
                <FlatList
                  data={collections}
                  keyExtractor={(c) => c.id}
                  horizontal
                  style={styles.collectionsList}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collectionsRow}
                  renderItem={({ item }) => (
                    <View
                      ref={(r) => {
                        if (r) collectionRefs.current.set(item.id, r);
                        else collectionRefs.current.delete(item.id);
                      }}
                      collapsable={false}
                    >
                      <CollectionCard
                        collection={item}
                        count={
                          materialsInCollection(item.id).length +
                          notesInCollection(item.id).length
                        }
                        onPress={() => router.push(`/collection/${item.id}`)}
                        onLongPress={() => setEditingCollection(item)}
                        highlighted={highlightedId === item.id}
                        dropPulse={
                          dropPulse.id === item.id ? dropPulse.count : undefined
                        }
                      />
                    </View>
                  )}
                />
              </View>
            ) : null}

            {items.length > 0 ? (
              <Text
                style={[
                  styles.sectionLabel,
                  { color: colors.mutedForeground, marginTop: 4 },
                ]}
              >
                Library
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          showEmptyState ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="upload-cloud"
                title="Your library is empty"
                description="Import a PDF to track your reading, or tap + to take a note."
              />
              <Button
                label={importing ? "Importing…" : "Import a PDF"}
                onPress={onPickPdf}
                loading={importing}
                disabled={importing}
                style={{ marginTop: 24, alignSelf: "center", paddingHorizontal: 28 }}
              />
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === "material" ? (
            <DraggableCard
              tx={dragTx}
              ty={dragTy}
              dimmed={
                dragItem?.kind === "material" &&
                dragItem.m.id === item.m.id
              }
              onLongPressStart={onCardLongPressStart}
              onMenuLongPress={() =>
                onCardMenuLongPress(() =>
                  onMaterialMenu(item.m.id, item.m.title),
                )
              }
              onDragBegin={(info) =>
                onCardDragBegin({ kind: "material", m: item.m }, info)
              }
              onDragMove={onCardDragMove}
              onDragEnd={(x, y) =>
                onCardDragEnd({ kind: "material", m: item.m }, x, y)
              }
            >
              <MaterialCard
                material={item.m}
                sessions={sessions}
                onPress={() => {
                  if (suppressTapRef.current) return;
                  router.push(`/study/${item.m.id}`);
                }}
                onMenuPress={() => onMaterialMenu(item.m.id, item.m.title)}
              />
            </DraggableCard>
          ) : (
            <DraggableCard
              tx={dragTx}
              ty={dragTy}
              dimmed={dragItem?.kind === "note" && dragItem.n.id === item.n.id}
              onLongPressStart={onCardLongPressStart}
              onMenuLongPress={() =>
                onCardMenuLongPress(() => onNoteMenu(item.n.id, item.n.title))
              }
              onDragBegin={(info) =>
                onCardDragBegin({ kind: "note", n: item.n }, info)
              }
              onDragMove={onCardDragMove}
              onDragEnd={(x, y) =>
                onCardDragEnd({ kind: "note", n: item.n }, x, y)
              }
            >
              <NoteCard
                note={item.n}
                onPress={() => {
                  if (suppressTapRef.current) return;
                  router.push(`/note/${item.n.id}`);
                }}
                onMenuPress={() => onNoteMenu(item.n.id, item.n.title)}
              />
            </DraggableCard>
          )
        }
      />

      {dragItem ? (
        <View
          pointerEvents="none"
          collapsable={false}
          style={[
            Platform.OS === "web"
              ? // Viewport-anchored on web: immune to any ancestor
                // overflow/transform/contain in the DOM.
                ({
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                } as unknown as ViewStyle)
              : StyleSheet.absoluteFill,
            styles.dragLayer,
          ]}
        >
          <Animated.View
            style={[
              styles.dragOverlay,
              { width: overlayWidth, shadowColor: "#000" },
              dragOverlayStyle,
            ]}
          >
            {dragItem.kind === "note" ? (
              <NoteCard note={dragItem.n} onPress={() => {}} />
            ) : (
              <MaterialCard
                material={dragItem.m}
                sessions={sessions}
                onPress={() => {}}
              />
            )}
          </Animated.View>
        </View>
      ) : null}

      <Toast
        message={toast}
        onHide={() => setToast(null)}
        bottomOffset={bottomPad}
      />

      <NameInputModal
        visible={nameModalOpen}
        title="New collection"
        placeholder="e.g. Calc 101"
        onSubmit={onCreateCollection}
        onCancel={() => setNameModalOpen(false)}
      />

      <NameInputModal
        visible={editingCollection !== null}
        title="Rename collection"
        placeholder="Collection name"
        initialValue={editingCollection?.name ?? ""}
        onSubmit={onRenameCollection}
        onCancel={() => setEditingCollection(null)}
      />

      <NameInputModal
        visible={renamingNote !== null}
        title="Rename note"
        placeholder="Note name"
        initialValue={renamingNote?.title ?? ""}
        onSubmit={onRenameNote}
        onCancel={() => setRenamingNote(null)}
      />

      {pickerTarget ? (
        <CollectionPickerModal
          target={pickerTarget}
          onClose={() => setPickerTarget(null)}
        />
      ) : null}

      {itemMenuTarget ? (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setItemMenuTarget(null)}
        >
          <Tappable
            style={addMenuStyles.backdrop}
            onPress={() => setItemMenuTarget(null)}
          >
            <Tappable
              onPress={() => {}}
              style={[
                addMenuStyles.sheet,
                {
                  backgroundColor: colors.background,
                  paddingBottom: insets.bottom + 16,
                },
              ]}
            >
              <Text
                style={[addMenuStyles.title, { color: colors.foreground }]}
                numberOfLines={2}
              >
                {itemMenuTarget.title || "Untitled"}
              </Text>
              {itemMenuTarget.kind === "note" ? (
                <MenuRow
                  icon="edit-2"
                  label="Rename"
                  onPress={() => {
                    const { id, title } = itemMenuTarget;
                    setItemMenuTarget(null);
                    setRenamingNote({ id, title });
                  }}
                  iconColor={colors.primary}
                  foreground={colors.foreground}
                  border={colors.border}
                />
              ) : null}
              <MenuRow
                icon="folder-plus"
                label="Add to collection…"
                onPress={() => {
                  setPickerTarget({
                    kind: itemMenuTarget.kind,
                    id: itemMenuTarget.id,
                  });
                  setItemMenuTarget(null);
                }}
                iconColor={colors.primary}
                foreground={colors.foreground}
                border={colors.border}
              />
              <MenuRow
                icon="trash-2"
                label="Delete"
                onPress={() => {
                  const { kind, id, title } = itemMenuTarget;
                  setItemMenuTarget(null);
                  if (kind === "material") confirmDeleteMaterial(id, title);
                  else confirmDeleteNote(id, title);
                }}
                iconColor={colors.destructive}
                foreground={colors.foreground}
                border={colors.border}
              />
              <Tappable
                onPress={() => setItemMenuTarget(null)}
                style={({ pressed }) => [
                  addMenuStyles.cancelRow,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text
                  style={[
                    addMenuStyles.cancelLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Cancel
                </Text>
              </Tappable>
            </Tappable>
          </Tappable>
        </Modal>
      ) : null}

      <Modal
        visible={addMenuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAddMenuOpen(false)}
      >
        <Tappable
          style={addMenuStyles.backdrop}
          onPress={() => setAddMenuOpen(false)}
        >
          <Tappable
            onPress={() => {}}
            style={[
              addMenuStyles.sheet,
              {
                backgroundColor: colors.background,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <Text style={[addMenuStyles.title, { color: colors.foreground }]}>
              Add to library
            </Text>
            <MenuRow
              icon="file-text"
              label="Import PDF"
              onPress={() => runFromMenu(onPickPdf)}
              iconColor={colors.primary}
              foreground={colors.foreground}
              border={colors.border}
            />
            <MenuRow
              icon="edit-3"
              label="New note"
              onPress={() => runFromMenu(onCreateNote)}
              iconColor={colors.primary}
              foreground={colors.foreground}
              border={colors.border}
            />
            <MenuRow
              icon="folder-plus"
              label="New collection"
              onPress={() => runFromMenu(() => setNameModalOpen(true))}
              iconColor={colors.primary}
              foreground={colors.foreground}
              border={colors.border}
            />
            <Tappable
              onPress={() => setAddMenuOpen(false)}
              style={({ pressed }) => [
                addMenuStyles.cancelRow,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  addMenuStyles.cancelLabel,
                  { color: colors.mutedForeground },
                ]}
              >
                Cancel
              </Text>
            </Tappable>
          </Tappable>
        </Tappable>
      </Modal>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  iconColor,
  foreground,
  border,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  iconColor: string;
  foreground: string;
  border: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      style={({ pressed }) => [
        addMenuStyles.row,
        { borderColor: border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Feather name={icon} size={20} color={iconColor} />
      <Text style={[addMenuStyles.rowLabel, { color: foreground }]}>
        {label}
      </Text>
    </Tappable>
  );
}

const addMenuStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  cancelRow: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
    gap: 12,
  },
  greeting: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: -0.8,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionsBlock: {
    marginBottom: 16,
    gap: 10,
  },
  collectionsRow: {
    gap: 12,
    paddingRight: 4,
  },
  // The row is a ScrollView, which clips children to its frame. Grow the
  // frame vertically so the drop-target highlight (scale + shadow) renders
  // fully, then cancel the layout shift with negative margins so the idle
  // page looks exactly the same.
  collectionsList: {
    paddingVertical: 20,
    marginVertical: -20,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 60,
  },
  dragLayer: {
    zIndex: 40,
  },
  dragOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 50,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
  },
});
