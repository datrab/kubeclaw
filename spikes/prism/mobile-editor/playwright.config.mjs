export default {
  testDir: "./tests",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4180",
    headless: true,
    launchOptions: { executablePath: "/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell" },
  },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4180", port: 4180, reuseExistingServer: false },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: "phone-landscape", use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
  ],
};
