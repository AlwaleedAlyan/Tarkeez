import { Platform } from "react-native";

import { getCached, setCached } from "@/db/repositories/youtubeClassifications";
import { classifyYouTubeVideoRemote } from "@/lib/api";

export type Verdict = { isEducational: boolean; reason: string };

async function isConnected(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine !== false;
  }
  try {
    const mod = await import("@react-native-community/netinfo");
    const state = await mod.default.fetch();
    return state.isConnected === true;
  } catch {
    return true;
  }
}

export async function classifyYouTubeVideo(videoId: string): Promise<Verdict> {
  const cached = await getCached(videoId);
  if (cached) {
    return { isEducational: cached.isEducational, reason: cached.reason };
  }

  if (!(await isConnected())) {
    return { isEducational: true, reason: "offline_optimistic" };
  }

  try {
    const verdict = await classifyYouTubeVideoRemote(videoId);
    await setCached(videoId, verdict);
    return verdict;
  } catch {
    return { isEducational: true, reason: "error_optimistic" };
  }
}
