import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: "/neukarustihS/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "icon-192.png",
        "icon-512.png",
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
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable.png",
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
