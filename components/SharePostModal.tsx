import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { Button } from "@/components/Button";
import { useColors } from "@/hooks/useColors";

type Props = {
  focusedSec: number;
  metricLabel: string;
  metricValue: number;
  focusPct: number;
  onClose: () => void;
};

const SCREEN = Dimensions.get("window");
const RESERVED_V = 200;
const MAX_W = SCREEN.width - 40;
const MAX_H = SCREEN.height - RESERVED_V;
const RATIO = 9 / 16;
const CARD_W = Math.min(MAX_W, MAX_H * RATIO);
const CARD_H = CARD_W / RATIO;
const LOGO = require("../assets/images/tarkeez_logo.png");

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

export function SharePostModal({
  focusedSec,
  metricLabel,
  metricValue,
  focusPct,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const captureCard = async () => {
    return captureRef(cardRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
  };

  const onShare = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Sharing on the web",
        "Open Tarkeez on your phone to share or save this post.",
      );
      return;
    }
    try {
      setBusy(true);
      const uri = await captureCard();
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        Alert.alert("Sharing isn't available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
      });
    } catch (e) {
      Alert.alert(
        "Couldn't share",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  };

  const onSavePhotos = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Photos on the web",
        "Saving to your camera roll is available on the mobile app.",
      );
      return;
    }
    try {
      setBusy(true);
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Tarkeez needs access to your photos to save the post.",
        );
        return;
      }
      const uri = await captureCard();
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert("Saved!", "Your post is in your camera roll.");
    } catch (e) {
      Alert.alert(
        "Couldn't save",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={({ pressed }) => [
              styles.closeBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityLabel="Close"
          >
            <Feather name="x" size={22} color="#ffffff" />
          </Pressable>
          <View style={{ width: 38 }} />
          <View style={{ width: 38 }} />
        </View>

        <View style={styles.cardWrap}>
          <View
            ref={cardRef}
            collapsable={false}
            style={[styles.card, { width: CARD_W, height: CARD_H }]}
          >
            <LinearGradient
              colors={["#0a0a0a", "#161616"]}
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={[colors.primary + "55", "transparent"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />

            <View style={styles.statsCol}>
              <Stat value={metricValue.toString()} label={metricLabel} />
              <View style={[styles.statDivider, { backgroundColor: "#ffffff20" }]} />
              <Stat value={fmtDuration(focusedSec)} label="Time" />
              <View style={[styles.statDivider, { backgroundColor: "#ffffff20" }]} />
              <Stat value={`${focusPct}%`} label="Focus" />
            </View>

            <View style={[styles.hDivider, { backgroundColor: "#ffffff14" }]} />

            <View style={styles.brandRow}>
              <Image
                source={LOGO}
                style={[styles.logo, { tintColor: colors.primary }]}
                resizeMode="contain"
              />
              <Text style={styles.brand}>TARKEEZ</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            label="Save to photos"
            variant="ghost"
            onPress={onSavePhotos}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Button
            label="Share"
            onPress={onShare}
            disabled={busy}
            style={{ flex: 1 }}
          />
        </View>

        {busy ? (
          <View style={styles.busyOverlay} pointerEvents="auto">
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  cardWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 28,
    overflow: "hidden",
    paddingHorizontal: 28,
    paddingVertical: 36,
    justifyContent: "space-between",
  },
  statsCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  statBlock: {
    alignItems: "center",
    gap: 8,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 56,
    color: "#ffffff",
    letterSpacing: -1.2,
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#ffffff",
    opacity: 0.65,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  statDivider: {
    height: 1,
    width: "55%",
  },
  hDivider: {
    height: 1,
    width: "100%",
    marginVertical: 12,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  logo: {
    width: 64,
    height: 64,
  },
  brand: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    color: "#ffffff",
    letterSpacing: -0.6,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
});
