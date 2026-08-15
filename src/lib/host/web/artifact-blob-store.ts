import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertSafeId } from "./paths";

export interface ArtifactBlobStore {
  write(storageKey: string, content: Buffer | string): Promise<void>;
  writeStream(
    storageKey: string,
    content: Readable,
    options?: { maxBytes?: number },
  ): Promise<void>;
  read(storageKey: string): Promise<Buffer | null>;
  createReadStream(
    storageKey: string,
    options?: { start?: number; end?: number },
  ): Promise<Readable | null>;
  contentSize(storageKey: string): Promise<number | null>;
}

function artifactPath(rootDir: string, storageKey: string): string {
  const segments = storageKey.split("/").map((segment) => assertSafeId(segment, "storageKey"));
  return join(rootDir, ...segments);
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function atomicWriteFile(filePath: string, data: string | Buffer): void {
  ensureDir(dirname(filePath));
  const temporary = join(dirname(filePath), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, data);
    renameSync(temporary, filePath);
  } catch (error) {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Preserve the primary write failure.
    }
    throw error;
  }
}

export function createLocalArtifactBlobStore(rootDir: string): ArtifactBlobStore {
  return {
    async write(storageKey, content) {
      atomicWriteFile(artifactPath(rootDir, storageKey), content);
    },

    async writeStream(storageKey, content, options) {
      const path = artifactPath(rootDir, storageKey);
      ensureDir(dirname(path));
      const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
      let written = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          written += chunk.length;
          if (options?.maxBytes !== undefined && written > options.maxBytes) {
            callback(new Error(`Artifact exceeds ${options.maxBytes} bytes`));
            return;
          }
          callback(null, chunk);
        },
      });
      try {
        await pipeline(content, limiter, createWriteStream(temporary, { flags: "w" }));
        renameSync(temporary, path);
      } catch (error) {
        try {
          if (existsSync(temporary)) unlinkSync(temporary);
        } catch {
          // Preserve the primary stream failure.
        }
        throw error;
      }
    },

    async read(storageKey) {
      const path = artifactPath(rootDir, storageKey);
      return existsSync(path) ? readFileSync(path) : null;
    },

    async createReadStream(storageKey, options) {
      const path = artifactPath(rootDir, storageKey);
      return existsSync(path) ? createReadStream(path, options) : null;
    },

    async contentSize(storageKey) {
      const path = artifactPath(rootDir, storageKey);
      return existsSync(path) ? statSync(path).size : null;
    },
  };
}

/** Writes only to primary while preserving reads for artifacts stored before a migration. */
export function withReadFallback(
  primary: ArtifactBlobStore,
  fallback: ArtifactBlobStore,
): ArtifactBlobStore {
  return {
    write: (storageKey, content) => primary.write(storageKey, content),
    writeStream: (storageKey, content, options) => primary.writeStream(storageKey, content, options),
    async read(storageKey) {
      return (await primary.read(storageKey)) ?? fallback.read(storageKey);
    },
    async createReadStream(storageKey, options) {
      return (await primary.createReadStream(storageKey, options))
        ?? fallback.createReadStream(storageKey, options);
    },
    async contentSize(storageKey) {
      return (await primary.contentSize(storageKey)) ?? fallback.contentSize(storageKey);
    },
  };
}
