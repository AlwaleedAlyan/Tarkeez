import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { safeHost } from "@/lib/normalizeUrl";

type Props = { url: string; title?: string };

export function InAppBrowserWeb({ url, title }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const host = useMemo(() => safeHost(url), [url]);
  const displayTitle = title || host;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={styles.titleBox}>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: colors.foreground }]}
          >
            {displayTitle}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.headerHost, { color: colors.mutedForeground }]}
          >
            {host}
          </Text>
        </View>
        <Tappable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Done"
          style={({ pressed }) => [
            styles.doneBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.doneLabel, { color: colors.accent }]}>Done</Text>
        </Tappable>
      </View>

      {loading ? (
        <View style={{ height: 2, backgroundColor: colors.muted }}>
          <View
            style={{ height: 2, width: "100%", backgroundColor: colors.accent }}
          />
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Cross-origin iframes can't be intercepted; sites with X-Frame-Options: DENY won't render. */}
        <iframe
          src={url}
          title={displayTitle}
          style={{ border: 0, width: "100%", height: "100%" }}
          onLoad={() => setLoading(false)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleBox: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  headerHost: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginTop: 1,
  },
  doneBtn: {
    height: 36,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  doneLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  body: {
    flex: 1,
  },
});
