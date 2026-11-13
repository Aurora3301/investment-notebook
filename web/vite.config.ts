import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const pages = process.env.GITHUB_PAGES === "true";
const base = pages ? "/investment-notebook/" : "./";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      injectRegister: null,
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "投資手帳",
        short_name: "投資手帳",
        description: "只存放在這部裝置的投資組合與筆記",
        lang: "zh-Hant-HK",
        dir: "ltr",
        display: "standalone",
        background_color: "#efeae2",
        theme_color: "#1b5e45",
        start_url: pages ? "/investment-notebook/" : "./",
        scope: pages ? "/investment-notebook/" : "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  build: {
    sourcemap: false,
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
