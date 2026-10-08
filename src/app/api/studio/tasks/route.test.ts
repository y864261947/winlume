import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),sessions:vi.fn(),runs:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({getCurrentUserId:mocks.user}));
vi.mock("@/lib/host/web/store-singleton",()=>({webStore:{sessions:{listSessions:mocks.sessions}}}));
vi.mock("@/lib/agent/infrastructure/run-store",()=>({createFileRunStore:()=>({listRuns:mocks.runs})}));
import { GET } from "./route";
beforeEach(()=>vi.resetAllMocks());
it("requires login before any storage access",async()=>{mocks.user.mockResolvedValue(null);expect((await GET()).status).toBe(401);expect(mocks.sessions).not.toHaveBeenCalled();expect(mocks.runs).not.toHaveBeenCalled();});
it("scopes both reads to the authenticated owner and disables caching",async()=>{mocks.user.mockResolvedValue("owner");mocks.sessions.mockResolvedValue([]);mocks.runs.mockResolvedValue([]);const r=await GET();expect(mocks.sessions).toHaveBeenCalledWith("owner");expect(mocks.runs).toHaveBeenCalledWith({userId:"owner"});expect(r.headers.get("Cache-Control")).toBe("private, no-store");expect(await r.json()).toEqual({tasks:[]});});
