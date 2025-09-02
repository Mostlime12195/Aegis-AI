import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import vueDevTools from "vite-plugin-vue-devtools";

// https://vite.dev/config/
export default defineConfig({
  css: { preprocessorOptions: { scss: {} } },
  assetsInclude: ["**/*.woff2", "**/*.woff"],
  optimizeDeps: {
    include: ["markdown-it-task-lists"],
  },
  plugins: [
    vue(),
    VitePWA({ registerType: "autoUpdate", injectRegister: "inline" }),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
