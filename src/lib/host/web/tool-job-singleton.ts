import path from "node:path";
import { createToolJobStore } from "./tool-job-store";

const root = process.env.REIZO_DATA_DIR ?? path.join(process.cwd(), "data");

/** File-backed MVP adapter. Its contract is intentionally independent of Chat Sessions. */
export const toolJobStore = createToolJobStore(root);
