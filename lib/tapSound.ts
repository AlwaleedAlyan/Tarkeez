import { type AudioPlayer, createAudioPlayer } from "expo-audio";

// UI tap sounds. Two preloaded variants:
//   "deep" — wood_deep, used by the shared Button (main CTAs)
//   "soft" — wood_soft, used by the theme controls
// Players are created lazily on first use. The pref gate lives here as a
// module flag (a plain module can't use hooks) — ThemeContext keeps it in
// sync via setTapSoundEnabled.

export type TapVariant = "deep" | "soft";

const players: Partial<Record<TapVariant, AudioPlayer | null>> = {};
const failed: Partial<Record<TapVariant, boolean>> = {};
let enabled = true;

function getPlayer(variant: TapVariant): AudioPlayer | null {
  if (players[variant] || failed[variant]) return players[variant] ?? null;
  try {
    const src =
      variant === "deep"
        ? require("@/assets/sounds/wood_deep.m4a")
        : require("@/assets/sounds/wood_soft.m4a");
    const player = createAudioPlayer(src);
    player.volume = 0.5;
    players[variant] = player;
  } catch {
    failed[variant] = true;
    players[variant] = null;
  }
  return players[variant] ?? null;
}

export function setTapSoundEnabled(value: boolean): void {
  enabled = value;
}

export function playTap(variant: TapVariant = "deep"): void {
  if (!enabled) return;
  const player = getPlayer(variant);
  if (!player) return;
  try {
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    /* UI feedback must never throw */
  }
}
