import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";

import { useAuth } from "@/contexts/AuthContext";

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const didNavigate = useRef(false);
  const videoEnded = useRef(false);

  const navigate = () => {
    if (didNavigate.current) return;
    didNavigate.current = true;
    router.replace(user ? "/(tabs)" : "/(auth)/login");
  };

  const player = useVideoPlayer(
    require("../assets/videos/animation4.mov"),
    (p) => {
      p.loop = false;
      p.play();
    }
  );

  // Primary: video finishes → navigate if auth is already resolved
  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      videoEnded.current = true;
      if (!isLoading) navigate();
    });
    return () => sub.remove();
  }, [player, isLoading, user]);

  // Secondary: auth resolves after video has already ended
  useEffect(() => {
    if (!isLoading && videoEnded.current) navigate();
  }, [isLoading, user]);

  // Web: .mov is not supported in browsers — route immediately
  useEffect(() => {
    if (Platform.OS === "web" && !isLoading) navigate();
  }, [isLoading, user]);

  if (Platform.OS === "web") return null;

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#faf7f2" },
});
