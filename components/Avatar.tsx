import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { PhotoTransform } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  uri?: string;
  transform?: PhotoTransform;
  name?: string;
  size: number;
};

const IDENTITY: PhotoTransform = { scale: 1, offsetX: 0, offsetY: 0 };

export function Avatar({ uri, transform, name, size }: Props) {
  const colors = useColors();
  const initial = (name ?? "?").trim().charAt(0).toUpperCase();

  if (!uri) {
    return (
      <View
        style={[
          styles.base,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.primary,
          },
        ]}
      >
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: Math.round(size * 0.4),
            color: colors.primaryForeground,
          }}
        >
          {initial}
        </Text>
      </View>
    );
  }

  const t = transform ?? IDENTITY;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.muted,
          overflow: "hidden",
        },
      ]}
    >
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          transform: [
            { translateX: t.offsetX * size },
            { translateY: t.offsetY * size },
            { scale: t.scale },
          ],
        }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
});
