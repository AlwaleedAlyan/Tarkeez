/**
 * Tests for features/classifier/urlClassifier.ts — Tier 1/2/3 chain.
 *
 * The global setup file (db/__tests__/helpers/setup.ts) mocks @/lib/api,
 * react-native, and @react-native-community/netinfo. We override @/lib/api
 * locally so we can spy on classifyUrlRemote, and stub @/db/repositories/
 * urlClassifications (no real DB needed — Tier 1/2 are pure, Tier 3 is
 * mocked at the network seam).
 */

jest.mock("@/db/repositories/urlClassifications", () => ({
  getCached: jest.fn().mockResolvedValue(null),
  setCached: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/api", () => ({
  classifyUrlRemote: jest.fn(),
}));
jest.mock("../whitelist.json", () => ["khanacademy.org", "coursera.org"], {
  virtual: false,
});

import { classifyUrlRemote } from "@/lib/api";

import {
  getCached,
  setCached,
} from "@/db/repositories/urlClassifications";

import { classifyUrl, extractDomain } from "../urlClassifier";

const mockClassifyUrlRemote = classifyUrlRemote as jest.MockedFunction<
  typeof classifyUrlRemote
>;
const mockGetCached = getCached as jest.MockedFunction<typeof getCached>;
const mockSetCached = setCached as jest.MockedFunction<typeof setCached>;

describe("extractDomain", () => {
  it("strips www.", () => {
    expect(extractDomain("https://www.khanacademy.org/foo")).toBe(
      "khanacademy.org",
    );
  });
  it("strips m.", () => {
    expect(extractDomain("https://m.wikipedia.org/wiki/Foo")).toBe(
      "wikipedia.org",
    );
  });
  it("lowercases", () => {
    expect(extractDomain("https://EXAMPLE.COM")).toBe("example.com");
  });
  it("returns null for garbage", () => {
    expect(extractDomain("not a url")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(extractDomain("")).toBeNull();
  });
});

describe("classifyUrl — 3-tier chain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCached.mockResolvedValue(null);
  });

  it("Tier 1: whitelist hit — instant pass, no API call", async () => {
    const v = await classifyUrl("https://www.khanacademy.org/math/algebra");
    expect(v).toEqual({ isEducational: true, reason: "whitelist" });
    expect(mockClassifyUrlRemote).not.toHaveBeenCalled();
    expect(mockSetCached).not.toHaveBeenCalled();
  });

  it("Tier 1: whitelist hit on subdomain via suffix match", async () => {
    const v = await classifyUrl("https://courses.khanacademy.org/foo");
    expect(v.reason).toBe("whitelist");
    expect(mockClassifyUrlRemote).not.toHaveBeenCalled();
  });

  it("Tier 1: blacklist hit — instant block, no API call", async () => {
    const v = await classifyUrl("https://facebook.com/feed");
    expect(v).toEqual({ isEducational: false, reason: "blacklist" });
    expect(mockClassifyUrlRemote).not.toHaveBeenCalled();
  });

  it("Tier 2: .edu TLD — instant pass", async () => {
    const v = await classifyUrl("https://cs.berkeley.edu/courses/cs61a");
    expect(v).toEqual({ isEducational: true, reason: "tld_edu" });
    expect(mockClassifyUrlRemote).not.toHaveBeenCalled();
  });

  it("Tier 2: .gov TLD — instant pass", async () => {
    const v = await classifyUrl("https://nasa.gov/missions");
    expect(v.reason).toBe("tld_gov");
  });

  it("Tier 2: keyword token in domain", async () => {
    const v = await classifyUrl("https://study-buddy.io");
    expect(v).toEqual({ isEducational: true, reason: "keyword:study" });
    expect(mockClassifyUrlRemote).not.toHaveBeenCalled();
  });

  it("Tier 2: keyword NOT matched on substring (avoids learnsex.com pitfall)", async () => {
    mockClassifyUrlRemote.mockResolvedValue({
      isEducational: false,
      reason: "llm_no",
    });
    await classifyUrl("https://learnsex.com");
    // "learnsex" is one token — "learn" must NOT match it.
    // So Tier 2 fails through to Tier 3.
    expect(mockClassifyUrlRemote).toHaveBeenCalledWith("learnsex.com");
  });

  it("Tier 3: ambiguous → Gemini called → cached in SQLite and in-memory", async () => {
    mockClassifyUrlRemote.mockResolvedValue({
      isEducational: true,
      reason: "llm_yes",
    });
    const v1 = await classifyUrl("https://example-blog.net/article");
    expect(mockClassifyUrlRemote).toHaveBeenCalledTimes(1);
    expect(mockClassifyUrlRemote).toHaveBeenCalledWith("example-blog.net");
    expect(mockSetCached).toHaveBeenCalledWith("example-blog.net", v1);

    // Second visit to the same domain hits in-memory cache — no extra calls.
    await classifyUrl("https://example-blog.net/other-path?q=1");
    expect(mockClassifyUrlRemote).toHaveBeenCalledTimes(1);
  });

  it("Tier 3: error falls back to optimistic (educational)", async () => {
    mockClassifyUrlRemote.mockRejectedValue(new Error("boom"));
    const v = await classifyUrl("https://unrelated-error-domain.test");
    expect(v).toEqual({ isEducational: true, reason: "error_optimistic" });
    expect(mockSetCached).not.toHaveBeenCalled();
  });

  it("SQLite cache hit short-circuits before Tier 1 fires", async () => {
    mockGetCached.mockResolvedValue({
      domain: "previously-classified.test",
      isEducational: false,
      reason: "llm_no",
      classifiedAt: Date.now(),
    });
    const v = await classifyUrl("https://previously-classified.test/page");
    expect(v).toEqual({ isEducational: false, reason: "llm_no" });
    expect(mockClassifyUrlRemote).not.toHaveBeenCalled();
  });

  it("invalid URL → fail-open", async () => {
    const v = await classifyUrl("not a url at all");
    expect(v).toEqual({
      isEducational: true,
      reason: "invalid_url_optimistic",
    });
  });
});
