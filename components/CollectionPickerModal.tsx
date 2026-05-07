import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { NameInputModal } from "@/components/NameInputModal";
import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  materialId: string;
  onClose: () => void;
};

export function CollectionPickerModal({ materialId, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    collections,
    cmRows,
    addMaterialToCollection,
    removeMaterialFromCollection,
    createCollection,
  } = useLibrary();

  const [creating, setCreating] = useState(false);

  const inSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of cmRows) {
      if (r.materialId === materialId) set.add(r.collectionId);
    }
    return set;
  }, [cmRows, materialId]);

  const onToggle = async (collectionId: string) => {
    try {
      if (inSet.has(collectionId)) {
        await removeMaterialFromCollection(materialId, collectionId);
      } else {
        await addMaterialToCollection(materialId, collectionId);
      }
    } catch {
      // optimistic update already happened; if API fails, the next refresh
      // will reconcile. Keep the picker open without an error toast for now.
    }
  };

  const onCreate = async (name: string) => {
    try {
      const c = await createCollection(name);
      await addMaterialToCollection(materialId, c.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 16,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Add to collection
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeBtn,
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {collections.length === 0 ? (
            <View style={{ paddingVertical: 24 }}>
              <EmptyState
                icon="folder"
                title="No collections yet"
                description="Create one to start organizing your materials."
              />
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
            >
              {collections.map((c) => {
                const checked = inSet.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onToggle(c.id)}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconBox,
                        { backgroundColor: colors.secondary },
                      ]}
                    >
                      <Feather name="folder" size={18} color={colors.primary} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowName, { color: colors.foreground }]}
                    >
                      {c.name}
                    </Text>
                    <View
                      style={[
                        styles.check,
                        {
                          borderColor: checked ? colors.primary : colors.border,
                          backgroundColor: checked
                            ? colors.primary
                            : "transparent",
                        },
                      ]}
                    >
                      {checked ? (
                        <Feather
                          name="check"
                          size={14}
                          color={colors.primaryForeground}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={{ padding: 20, paddingTop: 8 }}>
            <Button
              label="+ New collection"
              variant="ghost"
              onPress={() => setCreating(true)}
            />
          </View>
        </Pressable>
      </Pressable>

      <NameInputModal
        visible={creating}
        title="New collection"
        placeholder="e.g. Calc 101"
        onSubmit={onCreate}
        onCancel={() => setCreating(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: "80%",
    borderTopWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
