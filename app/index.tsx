import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      router.replace(user ? "/(tabs)" : "/(auth)/login");
    }
  }, [isLoading, user, router]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#faf7f2" },
});
