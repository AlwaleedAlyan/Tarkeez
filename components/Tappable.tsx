import * as Haptics from "expo-haptics";
import React, { forwardRef } from "react";
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
} from "react-native";

import { type TapVariant, playTap } from "@/lib/tapSound";

type Props = PressableProps & {
  // Opt-in tap sound. Defaults to silent — only main buttons and theme
  // controls make a sound, not every tappable element.
  sound?: TapVariant | "none";
  haptic?: boolean;
};

// Drop-in replacement for react-native's Pressable. Silent and haptic-free by
// default (behaves exactly like Pressable); pass `sound` / `haptic` to opt in.
export const Tappable = forwardRef<View, Props>(function Tappable(
  { onPress, sound = "none", haptic = false, ...rest },
  ref,
) {
  const handlePress = (e: GestureResponderEvent) => {
    if (sound !== "none") playTap(sound);
    if (haptic && Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress?.(e);
  };
  return <Pressable ref={ref} onPress={handlePress} {...rest} />;
});
