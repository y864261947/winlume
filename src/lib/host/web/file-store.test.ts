import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, it, expect, afterEach } from "vitest";
import type { ArtifactBlobStore } from "./artifact-blob-store";
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

  it("persists projects and filters sessions by project", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    const project = await store.projects.createProject({
      id: "project-1",
      userId: "u1",
      name: "Design system",
      description: "Shared work",
      pinnedSkillIds: ["skill-a"],
    });
    expect((await store.projects.getProject("u1", "project-1"))?.name).toBe("Design system");
    await store.sessions.createSession({
      id: "s1", userId: "u1", title: "In project", model: "gpt-4o-mini", projectId: project.id,
    });
    await store.sessions.createSession({
      id: "s2", userId: "u1", title: "Unscoped", model: "gpt-4o-mini",
    });
    expect((await store.sessions.listSessions("u1", project.id)).map((s) => s.id)).toEqual(["s1"]);
    await store.artifacts.write(
      {
        id: "project-artifact",
        userId: "u1",
        sessionId: "s1",
        projectId: project.id,
        name: "Shared brief",
        kind: "markdown",
        mimeType: "text/markdown",
        storageKey: "",
        createdAt: new Date().toISOString(),
      },
      "# Shared brief",
    );
    expect(
      (await store.artifacts.listByProject("u1", project.id)).map(
        (artifact) => artifact.id,
      ),
    ).toEqual(["project-artifact"]);
    const updated = await store.projects.updateProject("u1", "project-1", { instructions: "Be concise" });
    expect(updated.instructions).toBe("Be concise");
    await store.projects.deleteProject("u1", "project-1");
    expect(await store.projects.getProject("u1", "project-1")).toBeNull();
    expect((await store.sessions.getSession("u1", "s1"))?.projectId).toBeUndefined();
  });

  it("rejects unsafe project ids before touching the filesystem", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    await expect(store.projects.getProject("u1", "../escape")).rejects.toThrow(/Invalid projectId/);
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

  it("persists a capability preset and clears it only with a null patch", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);

    const created = await store.sessions.createSession({
      id: "s1",
      userId: "u1",
      title: "preset",
      model: "gpt-test",
      capabilityPresetId: "chat-default",
    });
    expect(created.capabilityPresetId).toBe("chat-default");
    expect((await store.sessions.getSession("u1", "s1"))?.capabilityPresetId).toBe(
      "chat-default",
    );
    expect((await store.sessions.listSessions("u1"))[0]?.capabilityPresetId).toBe(
      "chat-default",
    );

    const preserved = await store.sessions.updateSession("u1", "s1", {
      title: "renamed",
    });
    expect(preserved.capabilityPresetId).toBe("chat-default");

    const cleared = await store.sessions.updateSession("u1", "s1", {
      capabilityPresetId: null,
    });
    expect(cleared.capabilityPresetId).toBeUndefined();
    expect((await store.sessions.getSession("u1", "s1"))?.capabilityPresetId).toBeUndefined();
    expect((await store.sessions.listSessions("u1"))[0]?.capabilityPresetId).toBeUndefined();
  });

  it("persists a Codex thread id for specialist continuity", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "s1",
      userId: "u1",
      title: "coding",
      model: "gpt-5.6-terra",
    });

    await store.sessions.updateSession("u1", "s1", {
      codexThreadId: "thread-123",
    });

    expect((await store.sessions.getSession("u1", "s1"))?.codexThreadId).toBe(
      "thread-123",
    );
    expect(
      (await store.sessions.listSessions("u1")).find((s) => s.id === "s1")
        ?.codexThreadId,
    ).toBe("thread-123");
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

    expect((await store.artifacts.listByUser("u1")).map((artifact) => artifact.id)).toEqual([
      "visible-image",
    ]);
    expect((await store.artifacts.listBySession("u1", "s1")).map((artifact) => artifact.id)).toEqual([
      "visible-image",
    ]);
  });

  it("streams video bytes to disk and supports a byte range reader", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    const createdAt = new Date().toISOString();
    await store.artifacts.writeStream(
      {
        id: "video-1",
        userId: "u1",
        sessionId: "s1",
        name: "reference.mp4",
        kind: "video",
        mimeType: "video/mp4",
        storageKey: "",
        createdAt,
      },
      Readable.from([Buffer.from("abcdef")]),
      { maxBytes: 16 },
    );

    expect(await store.artifacts.contentSize("u1", "video-1")).toBe(6);
    const range = await store.artifacts.createReadStream("u1", "video-1", {
      start: 2,
      end: 4,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of range!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe("cde");

    await expect(
      store.artifacts.writeStream(
        {
          id: "too-large",
          userId: "u1",
          sessionId: "s1",
          name: "too-large.mp4",
          kind: "video",
          mimeType: "video/mp4",
          storageKey: "",
          createdAt,
        },
        Readable.from([Buffer.from("abcdef")]),
        { maxBytes: 3 },
      ),
    ).rejects.toThrow(/exceeds/);
    expect(await store.artifacts.get("u1", "too-large")).toBeNull();
  });

  it("writes new artifact bytes to an injected blob store", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-"));
    dirs.push(root);
    const blobs = new Map<string, Buffer>();
    const remote: ArtifactBlobStore = {
      async write(key, content) {
        blobs.set(key, Buffer.isBuffer(content) ? content : Buffer.from(content));
      },
      async writeStream(key, content) {
        const chunks: Buffer[] = [];
        for await (const chunk of content) chunks.push(Buffer.from(chunk));
        blobs.set(key, Buffer.concat(chunks));
      },
      async read(key) {
        return blobs.get(key) ?? null;
      },
      async createReadStream(key) {
        const value = blobs.get(key);
        return value ? Readable.from([value]) : null;
      },
      async contentSize(key) {
        return blobs.get(key)?.length ?? null;
      },
    };
    const store = createWebFileStore(root, { artifactBlobs: remote });
    await store.artifacts.write(
      {
        id: "remote-artifact",
        userId: "u1",
        sessionId: "s1",
        name: "remote.png",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("remote-content"),
    );

    expect(blobs.get("blobs/u1/remote-artifact")?.toString()).toBe("remote-content");
    expect(await store.artifacts.readContent("u1", "remote-artifact")).toEqual(
      Buffer.from("remote-content"),
    );
    expect(existsSync(join(root, "blobs", "u1", "remote-artifact"))).toBe(false);
  });
});
