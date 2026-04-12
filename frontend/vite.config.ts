import { defineConfig } from "vite";

export default defineConfig({
  build: {
    cssMinify: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5178,
  },
});
