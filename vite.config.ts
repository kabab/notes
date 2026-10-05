import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Tauri expects a fixed dev port and handles the screen itself.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**"] },
  },
  // Bundled into the app and loaded from disk, so chunk size doesn't matter.
  build: { chunkSizeWarningLimit: 2000 },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
