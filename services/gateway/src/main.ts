import { startGatewayServer } from "./server";

async function main() {
  const app = await startGatewayServer();
  const close = async (signal: string) => {
    app.log.info({ signal }, "Stopping WinLume gateway");
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start WinLume gateway", error);
  process.exitCode = 1;
});
