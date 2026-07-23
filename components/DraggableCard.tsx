import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  runOnJS,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD_PX = 10;

export type DragBeginInfo = {
  // Absolute screen position of the card's top-left corner at drag start.
  startX: number;
  startY: number;
};

type Props = {
  children: React.ReactNode;
  dimmed?: boolean;
  // Parent-owned shared values: absolute position of the drag overlay clone.
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  // Behavior 1: long-press released without crossing the drag threshold.
  onMenuLongPress: () => void;
  // Behavior 2 lifecycle (all on the JS thread via runOnJS).
  onDragBegin: (info: DragBeginInfo) => void;
  onDragMove: (absX: number, absY: number) => void;
  onDragEnd: (absX: number, absY: number) => void;
};

/**
 * Wraps a library card with a long-press → menu / long-press + drag → move
 * gesture. A plain Pan with activateAfterLongPress handles both:
 *  - touch released before LONG_PRESS_MS: pan never activates, the card's own
 *    Pressable handles the tap;
 *  - pointer moves before LONG_PRESS_MS: the pan fails, the parent list
 *    scrolls normally;
 *  - LONG_PRESS_MS elapses while holding: pan activates (haptic). Only when
 *    movement then crosses DRAG_THRESHOLD_PX do we switch to drag mode —
 *    otherwise release fires onMenuLongPress.
 */
export function DraggableCard({
  children,
  dimmed,
  tx,
  ty,
  onMenuLongPress,
  onDragBegin,
  onDragMove,
  onDragEnd,
}: Props) {
  const activated = useSharedValue(false); // long-press threshold reached
  const dragging = useSharedValue(false); // movement crossed drag threshold
  const ended = useSharedValue(false); // onEnd already ran for this gesture
  const touchDX = useSharedValue(0); // finger offset within the card
  const touchDY = useSharedValue(0);

  const thresholdHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  };

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .activateAfterLongPress(LONG_PRESS_MS)
    .shouldCancelWhenOutside(false)
    .onTouchesDown((e) => {
      const t = e.allTouches[0];
      if (t) {
        touchDX.value = t.x;
        touchDY.value = t.y;
      }
    })
    .onStart(() => {
      activated.value = true;
      runOnJS(thresholdHaptic)();
    })
    .onUpdate((e) => {
      if (!dragging.value) {
        if (Math.hypot(e.translationX, e.translationY) <= DRAG_THRESHOLD_PX) {
          return;
        }
        // Decide drag-vs-menu here, at the moment movement crosses the
        // threshold — not before.
        dragging.value = true;
        tx.value = e.absoluteX - touchDX.value;
        ty.value = e.absoluteY - touchDY.value;
        runOnJS(onDragBegin)({ startX: tx.value, startY: ty.value });
      }
      tx.value = e.absoluteX - touchDX.value;
      ty.value = e.absoluteY - touchDY.value;
      runOnJS(onDragMove)(tx.value, ty.value);
    })
    .onEnd((e) => {
      ended.value = true;
      if (dragging.value) {
        runOnJS(onDragEnd)(
          e.absoluteX - touchDX.value,
          e.absoluteY - touchDY.value,
        );
      } else {
        runOnJS(onMenuLongPress)();
      }
    })
    .onFinalize(() => {
      // Gesture cancelled mid-drag (no onEnd): snap back via onDragEnd.
      if (activated.value && dragging.value && !ended.value) {
        runOnJS(onDragEnd)(tx.value, ty.value);
      }
      activated.value = false;
      dragging.value = false;
      ended.value = false;
    });

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={{ opacity: dimmed ? 0.35 : 1 }}>
        {children}
      </View>
    </GestureDetector>
  );
}
