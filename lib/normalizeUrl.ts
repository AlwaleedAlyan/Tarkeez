export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const hasScheme = /^https?:\/\//i.test(trimmed);
  if (hasScheme) return trimmed;
  const looksLikeDomain = /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed);
  if (looksLikeDomain) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
