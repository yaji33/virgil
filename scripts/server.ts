import { createServer } from "node:http";
import { createApplication } from "../src/http/app.js";
import { handleApi } from "../src/http/handler.js";

const host = process.env.VIRGIL_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.VIRGIL_PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("VIRGIL_PORT must be a valid TCP port.");
}

const application = await createApplication();
const server = createServer((req, res) => {
  void handleApi(req, res, application.boundary, application.auth).then(
    (handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.end("Not found");
      }
    },
    () => {
      res.statusCode = 500;
      res.end("Internal server error");
    },
  );
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, host, resolve);
});
console.log(`Virgil backend listening on http://${host}:${port}`);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await application.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().then(() => process.exit(0), (error) => {
      console.error(error instanceof Error ? error.message : "Backend shutdown failed.");
      process.exit(1);
    });
  });
}
