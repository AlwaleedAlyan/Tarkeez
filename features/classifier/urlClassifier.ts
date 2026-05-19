import { Platform } from "react-native";

import { getCached, setCached } from "@/db/repositories/urlClassifications";
import { classifyUrlRemote } from "@/lib/api";

import { BLACKLIST, WHITELIST } from "./domainLists";

export type Verdict = { isEducational: boolean; reason: string };

const EDUCATIONAL_TLDS = new Set(["edu", "ac", "gov"]);
const EDUCATIONAL_KEYWORDS = new Set([
  "learn",
  "study",
  "academy",
  "course",
  "university",
  "college",
  "school",
]);

const memCache = new Map<string, Verdict>();

export function extractDomain(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname
      .toLowerCase()
      .replace(/^(www|m|mobile)\./, "");
  } catch {
    return null;
  }
}

function matchesList(domain: string, list: ReadonlySet<string>): boolean {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (list.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function tier1(domain: string): Verdict | null {
  if (matchesList(domain, WHITELIST)) {
    return { isEducational: true, reason: "whitelist" };
  }
  if (matchesList(domain, BLACKLIST)) {
    return { isEducational: false, reason: "blacklist" };
  }
  return null;
}

function tier2(domain: string): Verdict | null {
  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  if (EDUCATIONAL_TLDS.has(tld)) {
    return { isEducational: true, reason: `tld_${tld}` };
  }
  for (const tok of domain.split(/[.\-]/)) {
    if (EDUCATIONAL_KEYWORDS.has(tok)) {
      return { isEducational: true, reason: `keyword:${tok}` };
    }
  }
  return null;
}

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

export async function classifyUrl(rawUrl: string): Promise<Verdict> {
  const domain = extractDomain(rawUrl);
  if (!domain) return { isEducational: true, reason: "invalid_url_optimistic" };

  const mem = memCache.get(domain);
  if (mem) return mem;

  const cached = await getCached(domain);
  if (cached) {
    const v = { isEducational: cached.isEducational, reason: cached.reason };
    memCache.set(domain, v);
    return v;
  }

  const t1 = tier1(domain);
  if (t1) {
    memCache.set(domain, t1);
    return t1;
  }

  const t2 = tier2(domain);
  if (t2) {
    memCache.set(domain, t2);
    return t2;
  }

  if (!(await isConnected())) {
    return { isEducational: true, reason: "offline_optimistic" };
  }

  try {
    const verdict = await classifyUrlRemote(domain);
    memCache.set(domain, verdict);
    await setCached(domain, verdict);
    return verdict;
  } catch {
    return { isEducational: true, reason: "error_optimistic" };
  }
}
