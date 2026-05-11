import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import {
  CollectionPickerModal,
  type PickerTarget,
} from "@/components/CollectionPickerModal";
import { EmptyState } from "@/components/EmptyState";
import { MaterialCard } from "@/components/MaterialCard";
import { NameInputModal } from "@/components/NameInputModal";
import { NoteCard } from "@/components/NoteCard";
import {
  useLibrary,
  type Material,
  type Note,
} from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

type CollectionItem =
  | { kind: "material"; createdAt: number; m: Material }
  | { kind: "note"; createdAt: number; n: Note };

export default function CollectionDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    collections,
    materialsInCollection,
    notesInCollection,
    sessions,
    deleteMaterial,
    deleteNote,
    deleteCollection,
    updateCollection,
    removeMaterialFromCollection,
    removeNoteFromCollection,
  } = useLibrary();

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);

  const exitToLibrary = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);

  const collection = collections.find((c) => c.id === id);
  const materials = id ? materialsInCollection(id) : [];
  const notes = id ? notesInCollection(id) : [];

  const items: CollectionItem[] = useMemo(() => {
    const merged: CollectionItem[] = [
      ...materials.map((m) => ({
        kind: "material" as const,
        createdAt: m.createdAt,
        m,
      })),
      ...notes.map((n) => ({
        kind: "note" as const,
        createdAt: n.createdAt,
        n,
      })),
    ];
    merged.sort((a, b) => b.createdAt - a.createdAt);
    return merged;
  }, [materials, notes]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : insets.bottom + 24;

  if (!collection) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.center, { paddingTop: insets.top + 80 }]}>
          <Text style={{ color: colors.foreground }}>Collection not found.</Text>
          <Button
            label="Back to library"
            onPress={exitToLibrary}
            variant="ghost"
            style={{ marginTop: 12 }}
          />
        </View>
      </View>
    );
  }

  const onRename = async (name: string) => {
    try {
      await updateCollection(collection.id, name);
      setRenameOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not rename.";
      Alert.alert("Rename failed", msg);
    }
  };

  const onDeleteCollection = () => {
    const doDelete = async () => {
      try {
        await deleteCollection(collection.id);
        exitToLibrary();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not delete.";
        Alert.alert("Delete failed", msg);
      }
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert(
        `Delete "${collection.name}"?`,
        "Materials in this collection won't be deleted.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ],
      );
    }
  };

  const onMaterialMenu = (materialId: string, title: string) => {
    Alert.alert(title, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add to collection…",
        onPress: () =>
          setPickerTarget({ kind: "material", id: materialId }),
      },
      {
        text: "Remove from this collection",
        onPress: async () => {
          try {
            await removeMaterialFromCollection(materialId, collection.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Could not remove.";
            Alert.alert("Remove failed", msg);
          }
        },
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
    Alert.alert(title || "Untitled", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add to collection…",
        onPress: () => setPickerTarget({ kind: "note", id: noteId }),
      },
      {
        text: "Remove from this collection",
        onPress: async () => {
          try {
            await removeNoteFromCollection(noteId, collection.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Could not remove.";
            Alert.alert("Remove failed", msg);
          }
        },
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={exitToLibrary}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityLabel="Back to library"
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>

        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.foreground }]}
        >
          {collection.name}
        </Text>

        <Pressable
          onPress={() => setRenameOpen(true)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityLabel="Rename collection"
        >
          <Feather name="edit-2" size={16} color={colors.foreground} />
        </Pressable>

        <Pressable
          onPress={onDeleteCollection}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityLabel="Delete collection"
        >
          <Feather name="trash-2" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) =>
          item.kind === "material" ? `material-${item.m.id}` : `note-${item.n.id}`
        }
        scrollEnabled={items.length > 0}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: bottomPad,
          gap: 12,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="folder"
              title="Nothing in this collection yet"
              description="Add a PDF or note to this collection from the ⋮ menu."
            />
          </View>
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

      {pickerTarget ? (
        <CollectionPickerModal
          target={pickerTarget}
          onClose={() => setPickerTarget(null)}
        />
      ) : null}

      <NameInputModal
        visible={renameOpen}
        title="Rename collection"
        placeholder="Collection name"
        initialValue={collection.name}
        onSubmit={onRename}
        onCancel={() => setRenameOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  title: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    letterSpacing: -0.6,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 60,
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
});
