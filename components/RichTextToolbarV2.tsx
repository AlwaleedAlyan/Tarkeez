import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState, type RefObject } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  actions,
  type RichEditor,
} from "react-native-pell-rich-editor";

import { useColors } from "@/hooks/useColors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TEXT_COLORS = [
  "#111111",
  "#3A3A3D",
  "#7A7A7A",
  "#C53030",
  "#E55353",
  "#E58A2A",
  "#F2B441",
  "#3DAA52",
  "#3DAA86",
  "#3D7AE5",
  "#8C5BE5",
  "#C95BC5",
];

const FONT_FAMILIES: { label: string; value: string; sample: string }[] = [
  {
    label: "Sans",
    value:
      Platform.OS === "ios"
        ? "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
        : "Roboto, 'Inter', sans-serif",
    sample: "Aa",
  },
  {
    label: "Serif",
    value:
      Platform.OS === "ios"
        ? "Georgia, 'Times New Roman', serif"
        : "serif",
    sample: "Aa",
  },
  {
    label: "Mono",
    value: Platform.OS === "ios" ? "Menlo, Courier, monospace" : "monospace",
    sample: "Aa",
  },
];

const HEADINGS: { label: string; action: string }[] = [
  { label: "Body", action: actions.setParagraph },
  { label: "H1", action: actions.heading1 },
  { label: "H2", action: actions.heading2 },
  { label: "H3", action: actions.heading3 },
];

const ALIGNMENTS: {
  icon: keyof typeof Feather.glyphMap;
  action: string;
  label: string;
}[] = [
  { icon: "align-left", action: actions.alignLeft, label: "Align left" },
  { icon: "align-center", action: actions.alignCenter, label: "Align center" },
  { icon: "align-right", action: actions.alignRight, label: "Align right" },
];

type Sheet = "heading" | "color" | "align" | "font" | null;

type Props = {
  editor: RefObject<RichEditor | null>;
};

export function RichTextToolbarV2({ editor }: Props) {
  const colors = useColors();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const e = editor.current;
    if (!e) return;
    e.registerToolbar((items: (string | { type: string })[]) => {
      const names = items
        .map((it) => (typeof it === "string" ? it : it.type))
        .filter(Boolean) as string[];
      setSelected(names);
    });
  }, [editor]);

  const send = useCallback(
    (action: string) => {
      editor.current?.sendAction(action, "result");
    },
    [editor],
  );

  const closeSheet = () => setSheet(null);

  const isActive = (action: string) => selected.includes(action);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {sheet === "heading" ? (
        <Sheet
          title="Text style"
          surface={colors.card}
          border={colors.border}
          muted={colors.mutedForeground}
          onClose={closeSheet}
        >
          <View style={styles.chipRow}>
            {HEADINGS.map((h) => {
              const active = isActive(h.action);
              return (
                <Chip
                  key={h.action}
                  label={h.label}
                  active={active}
                  primary={colors.primary}
                  surface={colors.background}
                  border={colors.border}
                  foreground={colors.foreground}
                  onPress={() => {
                    send(h.action);
                    closeSheet();
                  }}
                />
              );
            })}
          </View>
        </Sheet>
      ) : null}

      {sheet === "font" ? (
        <Sheet
          title="Font"
          surface={colors.card}
          border={colors.border}
          muted={colors.mutedForeground}
          onClose={closeSheet}
        >
          <View style={styles.fontRow}>
            {FONT_FAMILIES.map((f) => (
              <Pressable
                key={f.label}
                accessibilityLabel={`${f.label} font`}
                onPress={() => {
                  editor.current?.sendAction(actions.fontName, "result", f.value);
                  closeSheet();
                }}
                style={({ pressed }) => [
                  styles.fontCard,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 28,
                    color: colors.foreground,
                    fontFamily:
                      f.label === "Serif"
                        ? Platform.select({
                            ios: "Georgia",
                            android: "serif",
                            default: "serif",
                          })
                        : f.label === "Mono"
                          ? Platform.select({
                              ios: "Menlo",
                              android: "monospace",
                              default: "monospace",
                            })
                          : "Inter_600SemiBold",
                  }}
                >
                  {f.sample}
                </Text>
                <Text
                  style={[styles.fontLabel, { color: colors.mutedForeground }]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      ) : null}

      {sheet === "color" ? (
        <Sheet
          title="Text color"
          surface={colors.card}
          border={colors.border}
          muted={colors.mutedForeground}
          onClose={closeSheet}
        >
          <View style={styles.colorGrid}>
            {TEXT_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityLabel={`Text color ${c}`}
                onPress={() => {
                  editor.current?.setForeColor(c);
                  closeSheet();
                }}
                style={({ pressed }) => [
                  styles.colorCell,
                  {
                    transform: [{ scale: pressed ? 0.92 : 1 }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: c,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
        </Sheet>
      ) : null}

      {sheet === "align" ? (
        <Sheet
          title="Alignment"
          surface={colors.card}
          border={colors.border}
          muted={colors.mutedForeground}
          onClose={closeSheet}
        >
          <View style={styles.chipRow}>
            {ALIGNMENTS.map((a) => (
              <IconBtn
                key={a.action}
                icon={a.icon}
                label={a.label}
                active={isActive(a.action)}
                activeBg={colors.secondary}
                activeIcon={colors.primary}
                idleIcon={colors.foreground}
                onPress={() => {
                  send(a.action);
                  closeSheet();
                }}
              />
            ))}
          </View>
        </Sheet>
      ) : null}

      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.barInner}
        >
          <IconBtn
            icon="rotate-ccw"
            label="Undo"
            active={false}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.undo)}
          />
          <IconBtn
            icon="rotate-cw"
            label="Redo"
            active={false}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.redo)}
          />

          <Divider color={colors.border} />

          <IconBtn
            icon="bold"
            label="Bold"
            active={isActive(actions.setBold)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.setBold)}
          />
          <IconBtn
            icon="italic"
            label="Italic"
            active={isActive(actions.setItalic)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.setItalic)}
          />
          <IconBtn
            icon="underline"
            label="Underline"
            active={isActive(actions.setUnderline)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.setUnderline)}
          />
          <IconBtn
            icon="minus"
            label="Strikethrough"
            active={isActive(actions.setStrikethrough)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.setStrikethrough)}
          />

          <Divider color={colors.border} />

          <LabelBtn
            label="Aa"
            active={sheet === "heading"}
            activeBg={colors.secondary}
            activeText={colors.primary}
            idleText={colors.foreground}
            onPress={() =>
              setSheet((s) => (s === "heading" ? null : "heading"))
            }
            accessibilityLabel="Text style"
          />
          <IconBtn
            icon="type"
            label="Font"
            active={sheet === "font"}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => setSheet((s) => (s === "font" ? null : "font"))}
          />
          <IconBtn
            icon="droplet"
            label="Text color"
            active={sheet === "color"}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => setSheet((s) => (s === "color" ? null : "color"))}
          />
          <IconBtn
            icon="align-left"
            label="Alignment"
            active={sheet === "align"}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => setSheet((s) => (s === "align" ? null : "align"))}
          />

          <Divider color={colors.border} />

          <IconBtn
            icon="list"
            label="Bullet list"
            active={isActive(actions.insertBulletsList)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.insertBulletsList)}
          />
          <IconBtn
            icon="hash"
            label="Numbered list"
            active={isActive(actions.insertOrderedList)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.insertOrderedList)}
          />
          <IconBtn
            icon="check-square"
            label="Checklist"
            active={isActive(actions.checkboxList)}
            activeBg={colors.secondary}
            activeIcon={colors.primary}
            idleIcon={colors.foreground}
            onPress={() => send(actions.checkboxList)}
          />
        </ScrollView>
      </View>
    </View>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

function IconBtn({
  icon,
  label,
  active,
  activeBg,
  activeIcon,
  idleIcon,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active: boolean;
  activeBg: string;
  activeIcon: string;
  idleIcon: string;
  onPress: () => void;
}) {
  const press = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, activeProgress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.08 }],
    backgroundColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      ["transparent", activeBg],
    ),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 320 });
      }}
      accessibilityLabel={label}
      style={[styles.btn, animStyle]}
    >
      <Feather name={icon} size={18} color={active ? activeIcon : idleIcon} />
    </AnimatedPressable>
  );
}

function LabelBtn({
  label,
  active,
  activeBg,
  activeText,
  idleText,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  activeBg: string;
  activeText: string;
  idleText: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const press = useSharedValue(0);
  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, activeProgress]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.08 }],
    backgroundColor: interpolateColor(
      activeProgress.value,
      [0, 1],
      ["transparent", activeBg],
    ),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 320 });
      }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.btn, animStyle]}
    >
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 14,
          color: active ? activeText : idleText,
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function Chip({
  label,
  active,
  primary,
  surface,
  border,
  foreground,
  onPress,
}: {
  label: string;
  active: boolean;
  primary: string;
  surface: string;
  border: string;
  foreground: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? primary : surface,
          borderColor: active ? primary : border,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 14,
          color: active ? "#fff" : foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Sheet({
  title,
  children,
  surface,
  border,
  muted,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  surface: string;
  border: string;
  muted: string;
  onClose: () => void;
}) {
  return (
    <>
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
        style={StyleSheet.absoluteFillObject}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Dismiss"
        />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(180)}
        exiting={SlideOutDown.duration(180)}
        style={[
          styles.sheet,
          { backgroundColor: surface, borderColor: border },
        ]}
      >
        <View style={[styles.sheetHandle, { backgroundColor: border }]} />
        <Text style={[styles.sheetTitle, { color: muted }]}>{title}</Text>
        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  bar: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 4 },
    }),
  },
  barInner: {
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 6,
    opacity: 0.6,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    position: "absolute",
    bottom: 72,
    left: 12,
    right: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderRadius: 22,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 10 },
    }),
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  fontRow: {
    flexDirection: "row",
    gap: 10,
  },
  fontCard: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    gap: 6,
  },
  fontLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 10,
  },
  colorCell: {
    width: `${100 / 6}%`,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
  },
});
