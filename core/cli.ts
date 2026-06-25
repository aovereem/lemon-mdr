#!/usr/bin/env node
import { serve } from "./serve.js";
import { homedir } from "node:os";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

interface Args {
  port: number;
  demo: boolean;
  noOpen: boolean;
  all: boolean;
  project?: string;
  transcripts?: string;
}

// Brand the banner from the host package.json, so a new skin changes NOTHING in core/ —
// it just sets its own `name` / `description` (and an optional `"cli": { "emoji": "🍋" }`).
function brand(): { name: string; desc: string; emoji: string } {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    return { name: pkg.name ?? "agent-observer", desc: pkg.description ?? "", emoji: pkg.cli?.emoji ?? "▸" };
  } catch {
    return { name: "agent-observer", desc: "", emoji: "▸" };
  }
}

function expand(p: string): string {
  return resolve(p.startsWith("~") ? p.replace(/^~/, homedir()) : p);
}

// Claude Code keeps a project's transcripts under ~/.claude/projects/<mangled-abs-path>,
// where the separators (and the drive colon / dots) become dashes — e.g.
// E:\dev\my-app → E--dev-my-app.
function projectDir(repoPath: string): string {
  return join(homedir(), ".claude", "projects", expand(repoPath).replace(/[:\\/.]/g, "-"));
}

function parseArgs(argv: string[]): Args {
  const args: Args = { port: 5180, demo: false, noOpen: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--demo") args.demo = true;
    else if (a === "--no-open") args.noOpen = true;
    else if (a === "--open") args.noOpen = false;
    else if (a === "--all") args.all = true;
    else if (a === "--port") args.port = Number(argv[++i]) || args.port;
    else if (a === "--project") { const p = argv[++i]; if (p) args.project = p; }
    else if (a === "--transcripts" || a === "--dir") { const d = argv[++i]; if (d) args.transcripts = expand(d); }
  }
  return args;
}

function openBrowser(url: string): void {
  import("node:child_process").then(({ spawn }) => {
    const [cmd, cmdArgs] = process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
    try { spawn(cmd, cmdArgs as string[], { stdio: "ignore", detached: true }).unref(); } catch { /* no browser → just print the url */ }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const b = brand();

  // DEFAULT: just THIS project (the cwd), keeping all its work. `--all` = every project
  // (recent + pruned). `--project <path>` / `--transcripts <dir>` aim it elsewhere.
  let watchDir: string | undefined;
  let persistent = false;
  let label: string;
  if (args.demo) { label = "demo mode — fake sessions"; }
  else if (args.all) { watchDir = undefined; label = "watching all projects"; }
  else if (args.transcripts) { watchDir = args.transcripts; persistent = true; label = `watching ${args.transcripts}`; }
  else { const repo = resolve(args.project ?? process.cwd()); watchDir = projectDir(repo); persistent = true; label = `watching this project · ${repo}`; }

  let closeServer: () => Promise<void> = async () => {};
  let closing = false;
  const shutdown = async (msg?: string) => {
    if (closing) return;
    closing = true;
    if (msg) console.log(msg);
    await closeServer();
    process.exit(0);
  };

  const { url, close, servesClient } = await serve({
    port: args.port,
    demo: args.demo,
    transcriptsDir: watchDir,
    persistent,
    onIdleExit: () => shutdown(`\n  ${b.emoji}  the window closed — see you next time.\n`),
  });
  closeServer = close;

  console.log(`\n  ${b.emoji}  ${b.name}`);
  if (b.desc) console.log(`      ${b.desc}`);
  console.log(`      ${label}`);
  console.log(`      ${url}\n`);

  if (servesClient && !args.noOpen) openBrowser(url);

  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
