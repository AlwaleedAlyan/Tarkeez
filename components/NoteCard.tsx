import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import type { Note } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  note: Note;
  onPress: () => void;
  onMenuPress?: () => void;
};

function fmtRelative(ts: number) {
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  if (diffSec < 60) return "just now";
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function previewFromHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function NoteCard({ note, onPress, onMenuPress }: Props) {
  const colors = useColors();

  const preview = useMemo(() => previewFromHtml(note.contentHtml), [
    note.contentHtml,
  ]);

  const press = useSharedValue(0);

  const handle = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  const cardAnim = useAnimatedStyle(() => {
    const scale = withSpring(1 - press.value * 0.03, {
      damping: 14,
      stiffness: 240,
    });
    return {
      transform: [{ scale }],
      borderColor: interpolateColor(
        press.value,
        [0, 1],
        [colors.border, colors.primary],
      ),
      shadowOpacity: withTiming(0.06 + press.value * 0.12, { duration: 160 }),
      elevation: withTiming(2 + press.value * 6, { duration: 160 }),
    };
  });

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).stiffness(160)}
      exiting={FadeOutUp.duration(180)}
      layout={LinearTransition.springify().damping(20).stiffness(180)}
    >
      <AnimatedPressable
        onPress={handle}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 120 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 200 });
        }}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            shadowColor: "#000",
          },
          cardAnim,
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
          <Feather name="edit-3" size={22} color={colors.primary} />
        </View>

        <View style={styles.content}>
          <Text
            numberOfLines={2}
            style={[styles.title, { color: colors.foreground }]}
          >
            {note.title || "Untitled"}
          </Text>

          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Feather name="clock" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {fmtRelative(note.updatedAt)}
              </Text>
            </View>
            {preview ? (
              <Text
                numberOfLines={1}
                style={[styles.preview, { color: colors.mutedForeground }]}
              >
                {preview}
              </Text>
            ) : null}
          </View>
        </View>

        {onMenuPress ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onMenuPress();
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.menuBtn,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            accessibilityLabel="Note options"
          >
            <Feather
              name="more-vertical"
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}

        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    lineHeight: 21,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  preview: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
