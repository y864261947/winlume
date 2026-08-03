import { describe, expect, it } from "vitest";
import { readMediaWorkerConfig } from "./config";

describe("media worker configuration", () => {
  it("requires a private token and an absolute Studio URL", () => {
    expect(() => readMediaWorkerConfig({})).toThrow("WINLUME_MEDIA_WORKER_TOKEN");
    expect(() =>
      readMediaWorkerConfig({ WINLUME_MEDIA_WORKER_TOKEN: "private-token" }),
    ).toThrow("WINLUME_MEDIA_APP_URL");
  });

  it("normalizes bounded worker settings", () => {
    const config = readMediaWorkerConfig({
      WINLUME_MEDIA_WORKER_TOKEN: "private-token",
      WINLUME_MEDIA_APP_URL: "http://127.0.0.1:3000/",
      WINLUME_MEDIA_WORKER_PORT: "4021",
      WINLUME_MEDIA_MAX_DURATION_SECONDS: "90",
      WINLUME_MEDIA_CONCURRENCY: "20",
    });
    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 4021,
      studioUrl: "http://127.0.0.1:3000",
      maxDurationSeconds: 90,
      concurrency: 4,
    });
  });
});
