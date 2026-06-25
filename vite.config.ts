import { defineConfig } from "vite";

// The Lemon MDR UI build. `npm run build` emits the static UI into dist/public/, which the
// bundled server (server/serve.ts → dist/cli.js) serves alongside the /colony WebSocket —
// that's what makes `npx lemon-mdr` self-contained. In dev (`npm run dev`) there's no
// server, so the client falls back to its embedded demo feed (force it with ?demo). For
// real data in dev, build once and run `node dist/cli.js`. This project is standalone.
export default defineConfig({
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
  server: {
    port: 5180,
  },
});
