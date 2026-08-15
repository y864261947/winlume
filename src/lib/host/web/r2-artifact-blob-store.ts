import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable, Transform } from "node:stream";
import type { ArtifactBlobStore } from "./artifact-blob-store";
import { assertSafeId } from "./paths";

const R2_OBJECT_PREFIX = "reizo/artifacts";

export type CloudflareR2ArtifactConfig = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function optionalEnv(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function readCloudflareR2ArtifactConfig(
  env: Record<string, string | undefined> = process.env,
): CloudflareR2ArtifactConfig | null {
  const values = {
    accountId: optionalEnv(env, "CLOUDFLARE_R2_ACCOUNT_ID"),
    bucket: optionalEnv(env, "CLOUDFLARE_R2_BUCKET"),
    accessKeyId: optionalEnv(env, "CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: optionalEnv(env, "CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  };
  if (Object.values(values).every((value) => value === undefined)) return null;
  if (Object.values(values).some((value) => value === undefined)) {
    throw new Error("Cloudflare R2 artifact storage requires all CLOUDFLARE_R2_* variables.");
  }
  return values as CloudflareR2ArtifactConfig;
}

function objectKey(storageKey: string): string {
  const safeKey = storageKey
    .split("/")
    .map((segment) => assertSafeId(segment, "storageKey"))
    .join("/");
  return `${R2_OBJECT_PREFIX}/${safeKey}`;
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404;
}

function asNodeStream(body: unknown): Readable | null {
  if (!body) return null;
  if (body instanceof Readable) return body;
  if (typeof body === "object" && "transformToWebStream" in body) {
    const webStream = (body as { transformToWebStream: () => ReadableStream<Uint8Array> })
      .transformToWebStream();
    return Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
  }
  if (typeof body === "object" && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new Error("R2 returned an unsupported object body.");
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function createCloudflareR2ArtifactBlobStore(
  config: CloudflareR2ArtifactConfig,
): ArtifactBlobStore {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async write(storageKey, content) {
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey(storageKey),
        Body: content,
      }));
    },

    async writeStream(storageKey, content, options) {
      let written = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          written += chunk.length;
          if (options?.maxBytes !== undefined && written > options.maxBytes) {
            const error = new Error(`Artifact exceeds ${options.maxBytes} bytes`);
            content.destroy(error);
            callback(error);
            return;
          }
          callback(null, chunk);
        },
      });
      content.on("error", (error) => limiter.destroy(error));
      content.pipe(limiter);
      await new Upload({
        client,
        leavePartsOnError: false,
        params: { Bucket: config.bucket, Key: objectKey(storageKey), Body: limiter },
      }).done();
    },

    async read(storageKey) {
      try {
        const response = await client.send(new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey(storageKey),
        }));
        const stream = asNodeStream(response.Body);
        return stream ? streamToBuffer(stream) : null;
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },

    async createReadStream(storageKey, options) {
      try {
        const response = await client.send(new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey(storageKey),
          ...(options ? { Range: `bytes=${options.start ?? ""}-${options.end ?? ""}` } : {}),
        }));
        return asNodeStream(response.Body);
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },

    async contentSize(storageKey) {
      try {
        const response = await client.send(new HeadObjectCommand({
          Bucket: config.bucket,
          Key: objectKey(storageKey),
        }));
        return response.ContentLength ?? null;
      } catch (error) {
        if (isMissingObject(error)) return null;
        throw error;
      }
    },
  };
}
