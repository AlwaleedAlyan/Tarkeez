import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { CollectionPickerModal } from "@/components/CollectionPickerModal";
import { EmptyState } from "@/components/EmptyState";
import { MaterialCard } from "@/components/MaterialCard";
import { NameInputModal } from "@/components/NameInputModal";
import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

export default function CollectionDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    collections,
    materialsInCollection,
    sessions,
    deleteMaterial,
    deleteCollection,
    updateCollection,
    removeMaterialFromCollection,
  } = useLibrary();

  const [pickerForMaterial, setPickerForMaterial] = useState<string | null>(
    null,
  );
  const [renameOpen, setRenameOpen] = useState(false);

  const exitToLibrary = useCallback(() => {
    router.replace("/(tabs)");
  }, [router]);

  const collection = collections.find((c) => c.id === id);
  const materials = id ? materialsInCollection(id) : [];

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
        onPress: () => setPickerForMaterial(materialId),
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
        data={materials}
        keyExtractor={(m) => m.id}
        scrollEnabled={materials.length > 0}
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
              title="No materials yet"
              description="Add a PDF to this collection from the ⋮ menu on any material."
            />
          </View>
        }
        renderItem={({ item }) => (
          <MaterialCard
            material={item}
            sessions={sessions}
            onPress={() => router.push(`/study/${item.id}`)}
            onMenuPress={() => onMaterialMenu(item.id, item.title)}
          />
        )}
      />

      {pickerForMaterial ? (
        <CollectionPickerModal
          materialId={pickerForMaterial}
          onClose={() => setPickerForMaterial(null)}
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
