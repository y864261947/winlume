import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTeamToken,
  fetchTeamTokenKey,
  findTeamTokenIdByName,
  getTokenUsage,
  loginAndMintPat,
  NewApiTeamError,
  revokeTeamToken,
} from "./team-client";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.NEW_API_URL = "https://v2api.top";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("loginAndMintPat", () => {
  it("logs in, carries the JWT access_token into the PAT-mint call at /api/user/token, and returns the PAT", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/user/login")) {
        return new Response(JSON.stringify({ success: true, data: { access_token: "jwt-abc123" } }), { status: 200 });
      }
      if (url.endsWith("/api/user/token")) {
        return new Response(JSON.stringify({ success: true, data: "pat-xyz" }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginAndMintPat("team-abc", "s3cret!!")).resolves.toBe("pat-xyz");

    const [patCallUrl, patCallInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patCallUrl).toBe("https://v2api.top/api/user/token");
    expect((patCallInit.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc123");
  });

  it("throws NewApiTeamError on login failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message: "bad password" }), { status: 200 })),
    );
    await expect(loginAndMintPat("team-abc", "wrong")).rejects.toThrow(NewApiTeamError);
  });

  it("throws NewApiTeamError if the login response has no access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })),
    );
    await expect(loginAndMintPat("team-abc", "s3cret!!")).rejects.toThrow(NewApiTeamError);
  });
});

describe("createTeamToken / findTeamTokenIdByName / fetchTeamTokenKey", () => {
  it("creates a token with the configured default group (gpt-pro) and unlimited quota", async () => {
    delete process.env.NEW_API_TOKEN_GROUP;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createTeamToken("pat-xyz", "studio");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/api/token/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pat-xyz");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "studio",
      group: "gpt-pro",
      remain_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
    });
  });

  it("honors NEW_API_TOKEN_GROUP when set", async () => {
    process.env.NEW_API_TOKEN_GROUP = "claude-max";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createTeamToken("pat-xyz", "studio");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).group).toBe("claude-max");
    delete process.env.NEW_API_TOKEN_GROUP;
  });

  it("finds a token id by exact name match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { items: [{ id: 7, name: "studio" }] } }), { status: 200 }),
      ),
    );
    await expect(findTeamTokenIdByName("pat-xyz", "studio")).resolves.toBe(7);
  });

  it("fetches the raw key and prefixes sk-", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { key: "rawkey123" } }), { status: 200 })),
    );
    await expect(fetchTeamTokenKey("pat-xyz", 7)).resolves.toBe("sk-rawkey123");
  });
});

describe("revokeTeamToken", () => {
  it("sends DELETE /api/token/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await revokeTeamToken("pat-xyz", 7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/api/token/7");
    expect(init.method).toBe("DELETE");
  });
});

describe("getTokenUsage", () => {
  it("authenticates with the token's own sk- key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: true, message: "ok", data: { total_granted: 1000, total_used: 250, total_available: 750 } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getTokenUsage("sk-rawkey123")).resolves.toEqual({
      totalGranted: 1000,
      totalUsed: 250,
      totalAvailable: 750,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/api/usage/token/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-rawkey123");
  });
});
