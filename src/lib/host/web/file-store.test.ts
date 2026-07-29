import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { createWebFileStore } from "./file-store";

describe("web file store", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it("creates session and appends messages", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    const session = await store.sessions.createSession({
      id: "s1",
      userId: "u1",
      title: "测试",
      model: "gpt-4o-mini",
    });
    expect(session.title).toBe("测试");
    await store.sessions.appendMessages("u1", "s1", [
      {
        id: "m1",
        sessionId: "s1",
        role: "user",
        content: "你好",
        createdAt: new Date().toISOString(),
      },
    ]);
    const msgs = await store.sessions.listMessages("u1", "s1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("你好");
  });

  it("persists pinnedSkillIds and allows clear with []", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "s1",
      userId: "u1",
      title: "pins",
      model: "gpt-4o-mini",
    });

    const withPins = await store.sessions.updateSession("u1", "s1", {
      pinnedSkillIds: ["skill-a", "skill-b"],
    });
    expect(withPins.pinnedSkillIds).toEqual(["skill-a", "skill-b"]);

    const reloaded = await store.sessions.getSession("u1", "s1");
    expect(reloaded?.pinnedSkillIds).toEqual(["skill-a", "skill-b"]);

    const listed = await store.sessions.listSessions("u1");
    expect(listed.find((s) => s.id === "s1")?.pinnedSkillIds).toEqual([
      "skill-a",
      "skill-b",
    ]);

    const cleared = await store.sessions.updateSession("u1", "s1", {
      pinnedSkillIds: [],
    });
    expect(cleared.pinnedSkillIds).toEqual([]);

    const afterClear = await store.sessions.getSession("u1", "s1");
    expect(afterClear?.pinnedSkillIds).toEqual([]);

    // title-only patch leaves pins unchanged
    await store.sessions.updateSession("u1", "s1", {
      pinnedSkillIds: ["keep-me"],
    });
    const titled = await store.sessions.updateSession("u1", "s1", {
      title: "renamed",
    });
    expect(titled.title).toBe("renamed");
    expect(titled.pinnedSkillIds).toEqual(["keep-me"]);
  });

  it("persists hidden annotation metadata without changing visible artifacts", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    const createdAt = new Date().toISOString();

    await store.artifacts.write(
      {
        id: "visible-image",
        userId: "u1",
        sessionId: "s1",
        name: "Visible image",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt,
      },
      Buffer.from("visible"),
    );
    await store.artifacts.write(
      {
        id: "annotation-image",
        userId: "u1",
        sessionId: "s1",
        name: "Annotation image",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        visibility: "hidden",
        purpose: "annotation",
        createdAt,
      },
      Buffer.from("annotation"),
    );

    const visible = await store.artifacts.get("u1", "visible-image");
    expect(visible?.visibility).toBeUndefined();
    expect(visible?.purpose).toBeUndefined();

    const annotation = await store.artifacts.get("u1", "annotation-image");
    expect(annotation?.visibility).toBe("hidden");
    expect(annotation?.purpose).toBe("annotation");
  });
});
