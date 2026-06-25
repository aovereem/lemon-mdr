import { watch, type FSWatcher } from "chokidar";
import { createReadStream, statSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { createInterface } from "node:readline";
import type { Fact } from "./fact.js";
import { parseLine } from "./parser.js";

export const DEFAULT_TRANSCRIPT_ROOT = join(homedir(), ".claude", "projects");

const RECENT_MS = 30 * 60_000; // global view: only cold-load transcripts touched this recently

/**
 * Tails Claude Code transcripts. Tracks a read offset per file so only newly appended
 * lines are parsed. Read-only; never writes anything back. Severance's own copy.
 */
export class TranscriptWatcher {
  private watcher?: FSWatcher;
  private offsets = new Map<string, number>();
  private rootCache = new Map<string, string>(); // file path → conversation root (first message uuid)

  constructor(private root: string = DEFAULT_TRANSCRIPT_ROOT, private persistent = false) {}

  get watchRoot(): string {
    return this.root;
  }

  start(onFact: (fact: Fact) => void, onDropSession: (sessionId: string) => void = () => {}): void {
    // chokidar v4 dropped glob support — watch the projects dir itself (recursive) and
    // filter to .jsonl ourselves. A literal glob silently matched nothing on Windows.
    this.watcher = watch(this.root, {
      ignoreInitial: false,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
    });

    // The initial scan reads files in arbitrary order, but a subagent only links to its
    // parent turn if facts arrive in time order. Buffer the cold scan, flush it sorted by
    // ts; after that, stream live facts straight through (they arrive in order).
    const buffer: Fact[] = [];
    let ready = false;
    const emit = (fact: Fact) => { if (ready) onFact(fact); else buffer.push(fact); };

    // A continued conversation (--continue / a fresh session after the old filled its
    // context) REPLAYS its predecessor verbatim into a new file — same conversation root.
    // Draining both double-counts. Key files by root and drain only the LATEST per root.
    const initial: string[] = [];
    const chosen = new Map<string, string>();
    const mtimeOf = (path: string) => { try { return statSync(path).mtimeMs; } catch { return 0; } };

    const handle = (path: string) => {
      if (!path.endsWith(".jsonl")) return;
      if (!ready) { initial.push(path); return; }
      const root = this.fileRoot(path);
      const cur = chosen.get(root);
      if (!cur || cur === path) { chosen.set(root, path); void this.drain(path, emit); return; }
      if (mtimeOf(path) > mtimeOf(cur)) {
        onDropSession(basename(cur, ".jsonl"));
        this.offsets.delete(cur);
        chosen.set(root, path);
        void this.drain(path, emit);
      }
    };
    this.watcher.on("add", handle).on("change", handle);
    this.watcher.on("ready", async () => {
      const latest = new Map<string, string>();
      for (const path of initial) {
        const root = this.fileRoot(path);
        const cur = latest.get(root);
        if (!cur || mtimeOf(path) > mtimeOf(cur)) latest.set(root, path);
      }
      const drains: Promise<void>[] = [];
      for (const [root, path] of latest) { chosen.set(root, path); drains.push(this.drain(path, emit)); }
      await Promise.allSettled(drains);
      buffer.sort((a, b) => a.ts - b.ts);
      for (const fact of buffer) onFact(fact);
      buffer.length = 0;
      ready = true;
    });
  }

  /** A file's conversation root = its first message uuid. Continuations share it; reads
   *  only the head (cheap, cached). Falls back to the file's own name → its own group. */
  private fileRoot(path: string): string {
    const cached = this.rootCache.get(path);
    if (cached) return cached;
    let root = basename(path, ".jsonl");
    try {
      const fd = openSync(path, "r");
      const buf = Buffer.alloc(524288); // 512 KB head
      const n = readSync(fd, buf, 0, buf.length, 0);
      closeSync(fd);
      for (const line of buf.toString("utf8", 0, n).split("\n").slice(0, 24)) {
        if (!line.trim()) continue;
        try { const o = JSON.parse(line); if (typeof o.uuid === "string") { root = o.uuid; break; } } catch { /* partial line — skip */ }
      }
    } catch { /* unreadable — fall back to the file's own name */ }
    this.rootCache.set(path, root);
    return root;
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
  }

  private async drain(path: string, onFact: (fact: Fact) => void): Promise<void> {
    let size: number;
    try {
      const st = statSync(path);
      // Project view (persistent) → load the whole history. Global view (--all, not
      // persistent) → skip never-touched files not changed recently (their sessions are gone).
      if (!this.persistent && !this.offsets.has(path) && Date.now() - st.mtimeMs > RECENT_MS) return;
      size = st.size;
    } catch {
      return;
    }
    const start = this.offsets.get(path) ?? 0;
    if (size <= start) {
      this.offsets.set(path, size);
      return;
    }

    const fileSessionId = basename(path, ".jsonl");
    const stream = createReadStream(path, { start, end: size - 1, encoding: "utf8" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      const fact = parseLine(line, fileSessionId);
      if (fact) onFact(fact);
    }
    this.offsets.set(path, size);
  }
}
