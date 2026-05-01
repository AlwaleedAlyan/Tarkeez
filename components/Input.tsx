import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = TextInputProps & {
  label?: string;
};

export function Input({ label, style, ...rest }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        {...rest}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
          },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  input: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
});
