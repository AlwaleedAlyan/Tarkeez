import React from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { useColors } from "@/hooks/useColors";

const CROP = 280;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

export type CropResult = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

type Props = {
  uri: string;
  onCancel: () => void;
  onSave: (result: CropResult) => void;
};

function clamp(v: number, lo: number, hi: number) {
  "worklet";
  return Math.max(lo, Math.min(hi, v));
}

export function CropPhotoModal({ uri, onCancel, onSave }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reset = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const limit = (CROP * (scale.value - 1)) / 2;
      tx.value = withTiming(clamp(tx.value, -limit, limit));
      ty.value = withTiming(clamp(ty.value, -limit, limit));
      savedTx.value = clamp(savedTx.value, -limit, limit);
      savedTy.value = clamp(savedTy.value, -limit, limit);
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      const limit = (CROP * (scale.value - 1)) / 2;
      tx.value = withTiming(clamp(tx.value, -limit, limit));
      ty.value = withTiming(clamp(ty.value, -limit, limit));
      savedTx.value = clamp(tx.value, -limit, limit);
      savedTy.value = clamp(ty.value, -limit, limit);
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const handleSave = () => {
    onSave({
      scale: scale.value,
      offsetX: tx.value / CROP,
      offsetY: ty.value / CROP,
    });
  };

  const incScale = (delta: number) => {
    const next = clamp(scale.value + delta, MIN_SCALE, MAX_SCALE);
    scale.value = withTiming(next);
    savedScale.value = next;
    const limit = (CROP * (next - 1)) / 2;
    if (Math.abs(tx.value) > limit) {
      tx.value = withTiming(clamp(tx.value, -limit, limit));
      savedTx.value = clamp(tx.value, -limit, limit);
    }
    if (Math.abs(ty.value) > limit) {
      ty.value = withTiming(clamp(ty.value, -limit, limit));
      savedTy.value = clamp(ty.value, -limit, limit);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={[
            styles.backdrop,
            {
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Text style={styles.heading}>Adjust your photo</Text>
          <Text style={styles.hint}>
            {Platform.OS === "web"
              ? "Drag to move. Use the +/− buttons to zoom."
              : "Pinch to zoom, drag to move."}
          </Text>

          <View style={styles.cropWrap}>
            <GestureDetector gesture={composed}>
              <Animated.View
                style={[
                  styles.cropBox,
                  { borderColor: colors.background },
                ]}
              >
                <Animated.View
                  style={[
                    { width: CROP, height: CROP },
                    animStyle,
                  ]}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: CROP, height: CROP }}
                    resizeMode="cover"
                  />
                </Animated.View>
              </Animated.View>
            </GestureDetector>
            <View pointerEvents="none" style={styles.ringOverlay} />
          </View>

          <View style={styles.zoomRow}>
            <Pressable
              onPress={() => incScale(-0.25)}
              style={({ pressed }) => [
                styles.zoomBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityLabel="Zoom out"
            >
              <Text style={styles.zoomGlyph}>−</Text>
            </Pressable>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.resetBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => incScale(0.25)}
              style={({ pressed }) => [
                styles.zoomBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityLabel="Zoom in"
            >
              <Text style={styles.zoomGlyph}>+</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <Button label="Use photo" onPress={handleSave} style={{ flex: 1 }} />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  heading: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#ffffff",
    marginTop: 8,
  },
  hint: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
    textAlign: "center",
  },
  cropWrap: {
    width: CROP,
    height: CROP,
    alignItems: "center",
    justifyContent: "center",
  },
  cropBox: {
    width: CROP,
    height: CROP,
    borderRadius: CROP / 2,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  ringOverlay: {
    position: "absolute",
    width: CROP,
    height: CROP,
    borderRadius: CROP / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  zoomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  zoomBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomGlyph: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: "#ffffff",
    lineHeight: 28,
  },
  resetBtn: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#ffffff",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
});

// suppress unused-import warning for runOnJS — kept for future onEnd JS calls
void runOnJS;
