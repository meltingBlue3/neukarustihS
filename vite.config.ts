import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

// https://vite.dev/config/
export default defineConfig({
  base: "/neukarustihS/",
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "icon-music-192.png",
        "icon-music-512.png",
        "night-cover.webp",
      ],
      manifest: {
        id: "/neukarustihS/",
        name: "neukarustihS",
        short_name: "neukarustihS",
        description: "你的音乐，你的深夜。本地优先的轻量音乐播放器。",
        lang: "zh-CN",
        theme_color: "#101117",
        background_color: "#101117",
        display: "standalone",
        scope: "/neukarustihS/",
        start_url: "/neukarustihS/",
        icons: [
          {
            src: "icon-music-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-music-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-music-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webp,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
