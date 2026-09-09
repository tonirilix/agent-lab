import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
