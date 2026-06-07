import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { normalizeUrl } from "@/lib/normalizeUrl";
import { openInAppBrowser } from "@/lib/openInAppBrowser";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

type Bookmark = {
  title: string;
  domain: string;
  url: string;
  icon: FeatherName;
};

type Recent = {
  title: string;
  url: string;
  ago: string;
  progress: number;
};

const BOOKMARKS: Bookmark[] = [
  { title: "YouTube",      domain: "youtube.com",     url: "https://youtube.com",      icon: "play" },
  { title: "Wikipedia",    domain: "wikipedia.org",   url: "https://wikipedia.org",    icon: "book-open" },
  { title: "Khan Academy", domain: "khanacademy.org", url: "https://khanacademy.org",  icon: "book" },
  { title: "Google",       domain: "google.com",      url: "https://google.com",       icon: "search" },
];

const RECENTS: Recent[] = [
  {
    title: "Linear Algebra — MIT OpenCourseWare",
    url: "ocw.mit.edu/courses/linear-algebra",
    ago: "2h ago",
    progress: 0.6,
  },
  {
    title: "Eigenvectors and Eigenvalues …",
    url: "youtube.com/watch?v=…",
    ago: "1d ago",
    progress: 0.4,
  },
  {
    title: "Shakespearean Sonnet Analysis",
    url: "britannica.com/art/sonnet",
    ago: "2d ago",
    progress: 0.75,
  },
];

export default function BrowserScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const topPad = Platform.OS === "web" ? 24 : insets.top;
  const bottomPad = (Platform.OS === "web" ? 100 : insets.bottom) + 80;

  function openUrl(url: string, title?: string) {
    openInAppBrowser(router, url, title);
  }

  function onSubmitSearch() {
    const target = normalizeUrl(query);
    if (!target) return;
    openUrl(target);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: bottomPad,
          paddingHorizontal: 20,
          gap: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>
            Browser
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Explore
          </Text>
        </View>

        <View
          style={[
            styles.search,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            placeholder="Search or enter URL"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSubmitSearch}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {query ? (
            <Tappable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </Tappable>
          ) : null}
        </View>

        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            Bookmarks
          </Text>
          <View style={styles.grid}>
            {BOOKMARKS.map((b) => (
              <Tappable
                key={b.url}
                onPress={() => openUrl(b.url, b.title)}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.tileIcon,
                    { backgroundColor: colors.secondary },
                  ]}
                >
                  <Feather name={b.icon} size={20} color={colors.accent} />
                </View>
                <Text style={[styles.tileTitle, { color: colors.foreground }]}>
                  {b.title}
                </Text>
                <Text
                  style={[styles.tileDomain, { color: colors.mutedForeground }]}
                >
                  {b.domain}
                </Text>
              </Tappable>
            ))}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            Recently visited
          </Text>
          <View style={{ gap: 12 }}>
            {RECENTS.map((r) => (
              <Tappable
                key={r.url}
                onPress={() => openUrl(`https://${r.url}`, r.title)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.rowIcon,
                    { backgroundColor: colors.secondary },
                  ]}
                >
                  <Feather name="globe" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.rowTitleRow}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.rowTitle,
                        { color: colors.foreground, flex: 1 },
                      ]}
                    >
                      {r.title}
                    </Text>
                    <View style={styles.rowAgoBox}>
                      <Feather
                        name="clock"
                        size={12}
                        color={colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.rowAgo,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {r.ago}
                      </Text>
                    </View>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.rowUrl, { color: colors.mutedForeground }]}
                  >
                    {r.url}
                  </Text>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(r.progress * 100)}%`,
                          backgroundColor: colors.accent,
                        },
                      ]}
                    />
                  </View>
                </View>
              </Tappable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kicker: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    marginBottom: 2,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: -0.8,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    paddingVertical: 0,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    minHeight: 130,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    marginTop: 4,
  },
  tileDomain: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  rowAgoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rowAgo: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  rowUrl: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
    marginTop: 2,
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },
});
