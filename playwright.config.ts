import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    channel: process.env.VIRGIL_BROWSER_CHANNEL,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec vite web --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: { ...process.env, VIRGIL_STORE: "memory" },
  },
});
