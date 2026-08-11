import { readMediaWorkerConfig } from "./config";
import { startMediaWorkerServer } from "./server";

async function main() {
  const config = readMediaWorkerConfig();
  const app = await startMediaWorkerServer(config);
  const close = async (signal: string) => {
    app.log.info({ signal }, "Stopping Reizo media worker");
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start Reizo media worker", error);
  process.exitCode = 1;
});
