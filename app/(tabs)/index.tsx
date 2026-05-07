import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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
import { CollectionCard } from "@/components/CollectionCard";
import { CollectionPickerModal } from "@/components/CollectionPickerModal";
import { EmptyState } from "@/components/EmptyState";
import { MaterialCard } from "@/components/MaterialCard";
import { NameInputModal } from "@/components/NameInputModal";
import { useAuth } from "@/contexts/AuthContext";
import { useLibrary, type Collection } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";
import { MAX_MATERIAL_BYTES } from "@/lib/api";

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const {
    collections,
    uncategorizedMaterials,
    materialsInCollection,
    sessions,
    addMaterial,
    deleteMaterial,
    createCollection,
    updateCollection,
  } = useLibrary();
  const [importing, setImporting] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [pickerForMaterial, setPickerForMaterial] = useState<string | null>(
    null,
  );

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

  const openAddMenu = () => {
    Alert.alert("Add to library", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Import PDF", onPress: onPickPdf },
      { text: "New collection", onPress: () => setNameModalOpen(true) },
    ]);
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
    Alert.alert(title, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add to collection…",
        onPress: () => setPickerForMaterial(materialId),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDelete(materialId, title),
      },
    ]);
  };

  const confirmDelete = (materialId: string, title: string) => {
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

  const showEmptyState =
    collections.length === 0 && uncategorizedMaterials.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={uncategorizedMaterials}
        keyExtractor={(m) => m.id}
        scrollEnabled={!showEmptyState}
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
              <Pressable
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
              </Pressable>
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
                      count={materialsInCollection(item.id).length}
                      onPress={() => router.push(`/collection/${item.id}`)}
                      onLongPress={() => setEditingCollection(item)}
                    />
                  )}
                />
              </View>
            ) : null}

            {uncategorizedMaterials.length > 0 ? (
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
                title="No PDFs yet"
                description="Import a PDF from your device — Stymer tracks your real reading time and pages automatically."
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
        renderItem={({ item }) => (
          <MaterialCard
            material={item}
            sessions={sessions}
            onPress={() => router.push(`/study/${item.id}`)}
            onMenuPress={() => onMaterialMenu(item.id, item.title)}
          />
        )}
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

      {pickerForMaterial ? (
        <CollectionPickerModal
          materialId={pickerForMaterial}
          onClose={() => setPickerForMaterial(null)}
        />
      ) : null}
    </View>
  );
}

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
