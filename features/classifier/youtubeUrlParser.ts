const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

export function parseYouTubeUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  const path = parsed.pathname.replace(/^\/+/, "");
  const segments = path.split("/");

  if (path === "watch" || segments[0] === "watch") {
    const v = parsed.searchParams.get("v") ?? "";
    return VIDEO_ID_RE.test(v) ? v : null;
  }

  if (segments[0] === "shorts" && segments[1]) {
    return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
  }

  if (segments[0] === "embed" && segments[1]) {
    return VIDEO_ID_RE.test(segments[1]) ? segments[1] : null;
  }

  return null;
}
