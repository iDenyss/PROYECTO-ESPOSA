const { defineConfig } = require("vite");

module.exports = defineConfig({
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/ws": { target: "ws://127.0.0.1:3000", ws: true }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
