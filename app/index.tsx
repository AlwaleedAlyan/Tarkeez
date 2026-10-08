import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    console.log("[Index] isLoading:", isLoading, "user:", !!user);
    if (!isLoading) {
      console.log("[Index] Attempting to route to", user ? "/(tabs)" : "/(auth)/login");
      try {
        router.replace(user ? "/(tabs)" : "/(auth)/login");
        console.log("[Index] Route replaced!");
      } catch (err) {
        console.error("[Index] Route error:", err);
      }
    }
  }, [isLoading, user, router]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#faf7f2" },
});
