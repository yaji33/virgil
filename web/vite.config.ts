import { defineConfig, type Plugin } from "vite";
import { createBoundary } from "../src/http/app.js";
import { handleApi } from "../src/http/handler.js";

function virgilApi(): Plugin {
  const boundary = createBoundary();
  return {
    name: "virgil-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        void boundary.then(
          (app) => handleApi(req, res, app).then((handled) => {
            if (!handled) next();
          }, next),
          next,
        );
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }
        void boundary.then(
          (app) => handleApi(req, res, app).then((handled) => {
            if (!handled) next();
          }, next),
          next,
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [virgilApi()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
