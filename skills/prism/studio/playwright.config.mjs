import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const managedChrome = "/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell";
const launchOptions = existsSync(managedChrome) ? { executablePath: managedChrome } : undefined;
export default defineConfig({ testDir: "./tests", workers: 1, use: { baseURL: "http://127.0.0.1:4190" }, webServer: { command: "npm run dev:studio", cwd: new URL("..", import.meta.url).pathname, url: "http://127.0.0.1:4190", reuseExistingServer: true }, projects: [
  { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 }, launchOptions } }, { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true, launchOptions } }, { name: "tablet", use: { browserName: "chromium", viewport: { width: 800, height: 1194 }, hasTouch: true, launchOptions } }
] });
