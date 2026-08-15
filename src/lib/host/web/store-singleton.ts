import path from "node:path";
import {
  createLocalArtifactBlobStore,
  withReadFallback,
} from "./artifact-blob-store";
import { createWebFileStore } from "./file-store";
import {
  createCloudflareR2ArtifactBlobStore,
  readCloudflareR2ArtifactConfig,
} from "./r2-artifact-blob-store";

const root = process.env.REIZO_DATA_DIR ?? path.join(process.cwd(), "data");
const localArtifacts = createLocalArtifactBlobStore(root);
const r2Config = readCloudflareR2ArtifactConfig();
const artifactBlobs = r2Config
  ? withReadFallback(createCloudflareR2ArtifactBlobStore(r2Config), localArtifacts)
  : localArtifacts;

export const webStore = createWebFileStore(root, { artifactBlobs });
