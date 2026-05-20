import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { playTap } from "@/lib/tapSound";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  testID,
}: Props) {
  const colors = useColors();

  const palette = {
    primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
    secondary: {
      bg: colors.secondary,
      fg: colors.secondaryForeground,
      border: colors.secondary,
    },
    ghost: { bg: "transparent", fg: colors.foreground, border: colors.border },
    destructive: {
      bg: colors.destructive,
      fg: colors.destructiveForeground,
      border: colors.destructive,
    },
  }[variant];

  const handlePress = () => {
    playTap("deep");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
