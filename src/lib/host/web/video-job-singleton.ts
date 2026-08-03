import path from "node:path";
import { createVideoJobStore } from "./video-job-store";

const root = process.env.WINLUME_DATA_DIR ?? path.join(process.cwd(), "data");

/** File-backed MVP adapter. Replace with a database-backed store before multi-node media workers. */
export const videoJobStore = createVideoJobStore(root);
