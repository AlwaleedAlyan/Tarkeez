import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  FadeInUp,
  FadeOutDown,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

const DISPLAY_MS = 2000;

type Props = {
  message: string | null;
  onHide: () => void;
  bottomOffset: number;
};

/** Minimal confirmation toast (the app has no toast library). */
export function Toast({ message, onHide, bottomOffset }: Props) {
  const colors = useColors();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, DISPLAY_MS);
    return () => clearTimeout(t);
  }, [message, onHide]);

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(180)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="none"
      style={[
        styles.toast,
        {
          bottom: bottomOffset,
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: "#000",
        },
      ]}
    >
      <Feather name="check-circle" size={16} color={colors.primary} />
      <Text
        numberOfLines={1}
        style={[styles.text, { color: colors.foreground }]}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: "85%",
  },
  text: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});
