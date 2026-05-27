import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { CollectionCard } from "@/components/CollectionCard";
import {
  CollectionPickerModal,
  type PickerTarget,
} from "@/components/CollectionPickerModal";
import { EmptyState } from "@/components/EmptyState";
import { MaterialCard } from "@/components/MaterialCard";
import { NameInputModal } from "@/components/NameInputModal";
import { NoteCard } from "@/components/NoteCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLibrary,
  type Collection,
  type Material,
  type Note,
} from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import { MAX_MATERIAL_BYTES } from "@/lib/api";

type LibraryItem =
  | { kind: "material"; createdAt: number; m: Material }
  | { kind: "note"; createdAt: number; n: Note };

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
  } = useLibrary();
  const [importing, setImporting] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [itemMenuTarget, setItemMenuTarget] = useState<{
    kind: "material" | "note";
    id: string;
    title: string;
  } | null>(null);

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
    action();
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
        scrollEnabled={!showEmptyState}
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
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collectionsRow}
                  renderItem={({ item }) => (
                    <CollectionCard
                      collection={item}
                      count={
                        materialsInCollection(item.id).length +
                        notesInCollection(item.id).length
                      }
                      onPress={() => router.push(`/collection/${item.id}`)}
                      onLongPress={() => setEditingCollection(item)}
                    />
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
            <MaterialCard
              material={item.m}
              sessions={sessions}
              onPress={() => router.push(`/study/${item.m.id}`)}
              onMenuPress={() => onMaterialMenu(item.m.id, item.m.title)}
            />
          ) : (
            <NoteCard
              note={item.n}
              onPress={() => router.push(`/note/${item.n.id}`)}
              onMenuPress={() => onNoteMenu(item.n.id, item.n.title)}
            />
          )
        }
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
});
