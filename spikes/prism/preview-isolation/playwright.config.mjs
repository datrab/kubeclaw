export default {
  testDir: "./tests",
  timeout: 20000,
  use: {
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: "/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell",
    },
  },
  webServer: {
    command: "node server.mjs",
    port: 4173,
    reuseExistingServer: false,
  },
};
