import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useLibrary } from "@/contexts/LibraryContext";
import { useColors } from "@/hooks/useColors";

function fmtDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { sessions, materials } = useLibrary();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 100 : insets.bottom + 80;

  const totals = useMemo(() => {
    const totalSec = sessions.reduce((s, x) => s + x.durationSec, 0);
    const pages = sessions.reduce((s, x) => s + (x.pagesRead ?? 0), 0);
    const days = new Set(
      sessions.map((s) => new Date(s.startedAt).toDateString()),
    ).size;
    return { totalSec, pages, days };
  }, [sessions]);

  const onLogout = () => {
    const doLogout = async () => {
      await logout();
      router.replace("/(auth)/login");
    };
    if (Platform.OS === "web") {
      doLogout();
    } else {
      Alert.alert("Sign out", "You can sign back in anytime.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.headerBar,
          { paddingTop: topPad + 8, paddingHorizontal: 20 },
        ]}
      >
        <View style={{ flex: 1 }} />
        <Tappable
          onPress={() => router.push("/settings")}
          style={({ pressed }) => [
            styles.gearBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel="Settings"
        >
          <Feather name="settings" size={20} color={colors.foreground} />
        </Tappable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: bottomPad,
          paddingHorizontal: 20,
          gap: 20,
        }}
      >
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={{ marginBottom: 6 }}>
            <Avatar
              uri={user?.photoUri}
              transform={user?.photoTransform}
              name={user?.name}
              size={76}
            />
          </View>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {user?.name ?? "Student"}
          </Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>
            {user?.email ?? ""}
          </Text>
        </View>

        <View
          style={[
            styles.statsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {fmtDuration(totals.totalSec)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Total focus
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {totals.pages}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Pages read
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {materials.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Materials
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {totals.days}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              Active days
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.infoIcon, { backgroundColor: colors.secondary }]}
          >
            <Feather name="info" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>
              How the timer works
            </Text>
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              The timer starts the moment you open a PDF and stops when you close it.
              It auto-pauses if your screen is idle for 1 minute or if you flick through pages too fast — so only real reading time counts.
            </Text>
          </View>
        </View>

        <Button label="Sign out" variant="ghost" onPress={onLogout} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
  },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
  },
  name: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.3 },
  email: { fontFamily: "Inter_500Medium", fontSize: 14 },
  statsCard: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Inter_500Medium", fontSize: 14 },
  divider: { height: 1 },
  infoCard: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
});
