import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from "vite";
import { createApplication, type Application } from "../src/http/app.js";
import { handleApi } from "../src/http/handler.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function virgilApi(): Plugin {
  let application: Promise<Application> | undefined;
  const attach = (server: ViteDevServer | PreviewServer): void => {
    application ??= createApplication();
    server.httpServer?.once("close", () => {
      void application?.then((app) => app.close()).catch(() => console.error("Workspace shutdown failed."));
    });
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith("/api/")) return next();
      void application!.then(
        (app) => handleApi(req, res, app.boundary, app.auth).then((handled) => {
          if (!handled) next();
        }, next),
        next,
      );
    });
  };
  return {
    name: "virgil-api",
    configureServer: attach,
    configurePreviewServer: attach,
    async closeBundle() {
      if (application) await (await application).close();
    },
  };
}

export default defineConfig(() => {
  try {
    process.loadEnvFile(resolve(root, ".env"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    envDir: root,
    plugins: [virgilApi()],
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
  };
});
