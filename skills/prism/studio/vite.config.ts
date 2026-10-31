import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [{ name: 'local-puck-fonts', enforce: 'pre', transform(code, id) {
    // Puck's optional remote font is unnecessary; use the local/system UI font.
    if (id.includes('@puckeditor') && id.endsWith('.css')) return code.replace(/@import\s+["']https:\/\/rsms\.me\/inter\/inter\.css["'];?/gu, '');
  } }, react()],
  build: { outDir: "../dist-studio", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 4190 },
});
