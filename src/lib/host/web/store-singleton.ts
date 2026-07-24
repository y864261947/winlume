import path from "node:path";
import { createWebFileStore } from "./file-store";

const root = process.env.WINLUME_DATA_DIR ?? path.join(process.cwd(), "data");
export const webStore = createWebFileStore(root);
