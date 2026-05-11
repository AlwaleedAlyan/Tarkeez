import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export default function NoteScreenWeb() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const topPad = Math.max(insets.top, 12);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
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
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="edit-3" size={28} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            Notes are mobile-only for now
          </Text>
          <Text style={[styles.body_text, { color: colors.mutedForeground }]}>
            The rich-text editor and drawing canvas use native modules that
            aren’t bundled in the desktop preview. Open this note on the iOS
            or Android dev build to view and edit it.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    maxWidth: 420,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  body_text: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
