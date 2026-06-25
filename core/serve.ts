import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNet } from "node:net";
import { type ServerMessage, STREAM_PATH } from "./protocol.js";
import { Store } from "./store.js";
import { TranscriptWatcher } from "./watcher.js";
import { startDemo } from "./demo.js";

const VERSION = "0.0.1";
const HOST = "127.0.0.1";
const SNAPSHOT_MS = 250; // ~4 fps of state; the skin interpolates motion
const IDLE_EXIT_MS = 4_000; // exit this long after the browser closes (a reload reconnects within it)

// The built UI is copied next to the compiled engine (dist/public) at build time. In dev
// there's no such dir (Vite serves the UI), so static-serve is skipped.
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".map": "application/json",
};

/** First free port at or above `start`, so a busy port steps to the next instead of crashing. */
async function firstFreePort(start: number, host: string): Promise<number> {
  for (let p = start; p < start + 20; p++) {
    const free = await new Promise<boolean>((res) => {
      const probe = createNet();
      probe.once("error", () => res(false));
      probe.once("listening", () => probe.close(() => res(true)));
      probe.listen(p, host);
    });
    if (free) return p;
  }
  return start;
}

export interface ServeOptions {
  port: number;
  demo: boolean;
  /** A transcript dir to watch instead of the default ~/.claude/projects. */
  transcriptsDir?: string;
  /** Persist mode (project/dir scope): load the WHOLE history, never auto-prune idle sessions. */
  persistent?: boolean;
  /** Fires once the last browser disconnects and doesn't return — used to exit when the window closes. */
  onIdleExit?: () => void;
}

export async function serve(opts: ServeOptions): Promise<{ url: string; close: () => Promise<void>; servesClient: boolean }> {
  const store = new Store(opts.persistent);
  const clients = new Set<WebSocket>();
  const servesClient = existsSync(PUBLIC_DIR); // only when packaged (dist/public present)

  const httpServer = createHttp((req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? "/").split("?")[0];
    if (urlPath === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: VERSION, demo: opts.demo }));
      return;
    }
    if (!servesClient) { res.writeHead(200, { "content-type": "text/plain" }); res.end("engine running (no UI bundle — build the skin to serve it)"); return; }
    const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
    const ext = extname(rel);
    const file = ext ? join(PUBLIC_DIR, rel) : join(PUBLIC_DIR, "index.html"); // SPA fallback
    if (!file.startsWith(PUBLIC_DIR) || !existsSync(file)) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });

  const port = await firstFreePort(opts.port, HOST);
  await new Promise<void>((resolve) => httpServer.listen(port, HOST, resolve));

  const wss = new WebSocketServer({ server: httpServer, path: STREAM_PATH });
  let armed = false;
  let idleTimer: NodeJS.Timeout | undefined;
  wss.on("connection", (ws) => {
    clients.add(ws);
    armed = true;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; } // a reconnect cancels a pending exit
    send(ws, { type: "hello", data: { version: VERSION, demo: opts.demo } });
    ws.on("close", () => {
      clients.delete(ws);
      if (servesClient && armed && clients.size === 0 && opts.onIdleExit) {
        idleTimer = setTimeout(opts.onIdleExit, IDLE_EXIT_MS);
      }
    });
  });

  // feed the store
  let stopFeed: () => void = () => {};
  if (opts.demo) {
    stopFeed = startDemo((fact) => store.ingest(fact));
  } else {
    const watcher = new TranscriptWatcher(opts.transcriptsDir, opts.persistent);
    watcher.start(
      (fact) => store.ingest(fact),
      (sessionId) => store.dropSession(sessionId), // a continuation superseded its predecessor
    );
    stopFeed = () => void watcher.stop();
  }

  // broadcast snapshots
  const broadcast = setInterval(() => {
    const msg: ServerMessage = { type: "snapshot", data: store.snapshot() };
    for (const ws of clients) send(ws, msg);
  }, SNAPSHOT_MS);

  const close = async () => {
    clearInterval(broadcast);
    stopFeed();
    wss.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { url: `http://localhost:${port}`, close, servesClient };
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
