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
import { EmptyState } from "@/components/EmptyState";
import { MaterialCard } from "@/components/MaterialCard";
import { useAuth } from "@/contexts/AuthContext";
import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { materials, sessions, addMaterial } = useLibrary();
  const [importing, setImporting] = useState(false);

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={materials}
        keyExtractor={(m) => m.id}
        scrollEnabled={materials.length > 0}
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: bottomPad,
          paddingHorizontal: 20,
          gap: 12,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
                {user ? `Hello, ${user.name.split(" ")[0]}` : "Hello"}
              </Text>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Your library
              </Text>
            </View>
            <Pressable
              onPress={onPickPdf}
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
              <Feather name="plus" size={22} color={colors.primaryForeground} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="upload-cloud"
              title="No PDFs yet"
              description="Import a PDF from your device — Tarkeez tracks your real reading time and pages automatically."
            />
            <Button
              label={importing ? "Importing…" : "Import a PDF"}
              onPress={onPickPdf}
              loading={importing}
              disabled={importing}
              style={{ marginTop: 24, alignSelf: "center", paddingHorizontal: 28 }}
            />
          </View>
        }
        renderItem={({ item }) => (
          <MaterialCard
            material={item}
            sessions={sessions}
            onPress={() => router.push(`/study/${item.id}`)}
          />
        )}
      />
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
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 60,
  },
});
