import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Tappable } from "@/components/Tappable";

import type { Collection } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  collection: Collection;
  count: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** True while a dragged card hovers over this collection (drop target). */
  highlighted?: boolean;
  /** Increment to play the post-drop success pulse. */
  dropPulse?: number;
};

export function CollectionCard({
  collection,
  count,
  onPress,
  onLongPress,
  highlighted = false,
  dropPulse,
}: Props) {
  const colors = useColors();

  const highlight = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    highlight.value = withSpring(highlighted ? 1 : 0, {
      damping: 15,
      stiffness: 240,
    });
  }, [highlighted, highlight]);

  useEffect(() => {
    if (!dropPulse) return;
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: 450 });
  }, [dropPulse, pulse]);

  const frameAnim = useAnimatedStyle(() => {
    const h = highlight.value;
    // Success pulse: smooth 0 → +8% → 0 scale bump.
    const pulseScale = Math.sin(pulse.value * Math.PI) * 0.08;
    return {
      transform: [{ scale: 1 + h * 0.06 + pulseScale }],
      borderColor: interpolateColor(
        h,
        [0, 1],
        [colors.border, colors.primary],
      ),
      backgroundColor: interpolateColor(
        h,
        [0, 1],
        [colors.card, colors.secondary],
      ),
      shadowOpacity: h * 0.15,
      elevation: h * 6,
    };
  });

  const handle = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress();
  };

  const handleLong = () => {
    if (!onLongPress) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onLongPress();
  };

  return (
    <Animated.View
      style={[styles.frame, { shadowColor: "#000" }, frameAnim]}
    >
      <Tappable
        onPress={handle}
        onLongPress={onLongPress ? handleLong : undefined}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.card,
          {
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
          <Feather name="folder" size={22} color={colors.primary} />
        </View>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: colors.foreground }]}
        >
          {collection.name}
        </Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {count} {count === 1 ? "material" : "materials"}
        </Text>
      </Tappable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 160,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  card: {
    padding: 14,
    gap: 10,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
    minHeight: 40,
  },
  count: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
