import Fastify, { type FastifyInstance } from "fastify";
import { hasValidWorkerToken } from "./auth";
import type { MediaWorkerConfig } from "./config";
import { processMediaJob } from "./processor";
import { parseMediaWorkerJob, type MediaWorkerJob } from "./types";

class MediaJobQueue {
  private readonly pending: MediaWorkerJob[] = [];
  private readonly activeIds = new Set<string>();
  private active = 0;

  constructor(
    private readonly config: MediaWorkerConfig,
    private readonly app: FastifyInstance,
  ) {}

  enqueue(job: MediaWorkerJob): boolean {
    if (this.activeIds.has(job.id)) return false;
    this.activeIds.add(job.id);
    this.pending.push(job);
    void this.drain();
    return true;
  }

  private async drain(): Promise<void> {
    while (this.active < this.config.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) return;
      this.active += 1;
      void processMediaJob(this.config, job)
        .catch((error) => {
          this.app.log.error({ err: error, jobId: job.id }, "Media job failed");
        })
        .finally(() => {
          this.active -= 1;
          this.activeIds.delete(job.id);
          void this.drain();
        });
    }
  }

  snapshot(): { queued: number; active: number } {
    return { queued: this.pending.length, active: this.active };
  }
}

export function buildMediaWorkerServer(config: MediaWorkerConfig): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });
  const queue = new MediaJobQueue(config, app);

  app.get("/healthz", async () => ({
    status: "ok",
    service: "winlume-media-worker",
    ...queue.snapshot(),
  }));

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/healthz") return;
    if (!hasValidWorkerToken(request.headers, config.workerToken)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.post<{ Body: unknown }>("/jobs", async (request, reply) => {
    const job = parseMediaWorkerJob(request.body);
    if (!job) return reply.code(400).send({ error: "Invalid media job" });
    const accepted = queue.enqueue(job);
    return reply.code(accepted ? 202 : 200).send({
      accepted: true,
      duplicate: !accepted,
      ...queue.snapshot(),
    });
  });

  return app;
}

export async function startMediaWorkerServer(
  config: MediaWorkerConfig,
): Promise<FastifyInstance> {
  const app = buildMediaWorkerServer(config);
  await app.listen({ host: config.host, port: config.port });
  return app;
}
