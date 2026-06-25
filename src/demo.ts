import type { SessionSnapshot, Snapshot, TurnSnapshot } from "./protocol";

/**
 * A self-contained snapshot feed so the terminal runs with no server. It fabricates a
 * handful of sessions whose work counters climb over time — the same shape the real
 * server emits — so the field, the boxes, and the percentage all animate. main.ts swaps
 * to a live WebSocket when one is available.
 */

const FILES = [
  "refactor the auth flow",
  "fix the failing watcher test",
  "wire up the websocket",
];
const SUB = "audit the parser";

interface DemoSession {
  id: string;
  label: string;
  kind: "root" | "sub";
  parentId?: string;
  tokens: number;
  reads: number;
  linesAdded: number;
  linesRemoved: number;
  commits: number;
  fetches: number;
  turns: TurnSnapshot[];
  lastActiveTs: number;
}

function mkTurn(id: string, i: number, flags: { interrupted?: boolean; hung?: boolean } = {}): TurnSnapshot {
  // Give each turn a random "mood" so the boxes get all four tempers (and the odd balanced
  // cycle). The box model reads each turn's own diff counts — this is what drives the demo.
  const big = Math.random() < 0.3;
  let linesAdded = 0, linesRemoved = 0, reads = 0, edited = false, verified = false, committed = false;
  let interrupted = flags.interrupted ?? false;
  const hung = flags.hung ?? false;
  if (hung) {
    reads = rnd(2, 9); // dread — stuck mid-turn
  } else if (interrupted) {
    verified = true; reads = rnd(0, 3); // malice — interrupted
  } else {
    const mood = Math.random();
    if (mood < 0.25) { edited = true; linesAdded = rnd(25, big ? 95 : 55); committed = Math.random() < 0.3; } // frolic
    else if (mood < 0.50) { edited = true; linesRemoved = rnd(25, big ? 75 : 50); linesAdded = rnd(0, 6); } // woe
    else if (mood < 0.75) { reads = rnd(22, big ? 55 : 38); } // dread
    else { verified = true; reads = rnd(2, 8); if (Math.random() < 0.5) interrupted = true; } // malice
  }
  return {
    id: `${id}#${i}`,
    label: "turn",
    tokens: rnd(800, 6000),
    actions: rnd(2, 9),
    durationMs: rnd(4000, 90000),
    startTs: Date.now(),
    subagents: 0,
    edited,
    verified,
    interrupted,
    hung,
    done: !hung,
    linesAdded,
    linesRemoved,
    reads,
    committed,
  };
}

export function startDemo(onSnapshot: (snap: Snapshot) => void): () => void {
  const now = Date.now();
  const sessions: DemoSession[] = FILES.map((label, i) => ({
    id: `demo-${i}`,
    label,
    kind: "root",
    tokens: rnd(2000, 20000),
    reads: rnd(2, 14),
    linesAdded: rnd(10, 90),
    linesRemoved: rnd(0, 30),
    commits: 0,
    fetches: 0,
    turns: Array.from({ length: rnd(2, 6) }, (_, k) => mkTurn(`demo-${i}`, k)),
    lastActiveTs: now - i * 4000,
  }));
  // one subagent, forked off the first session
  sessions.push({
    id: "demo-sub",
    label: SUB,
    kind: "sub",
    parentId: "demo-0",
    tokens: rnd(1000, 6000),
    reads: rnd(1, 8),
    linesAdded: rnd(0, 24),
    linesRemoved: 0,
    commits: 0,
    fetches: 0,
    turns: Array.from({ length: rnd(1, 3) }, (_, k) => mkTurn("demo-sub", k)),
    lastActiveTs: now - 2000,
  });

  let active = 0;
  let stalledUntil = 0;

  const tick = () => {
    const t = Date.now();
    if (Math.random() < 0.15) active = Math.floor(Math.random() * sessions.length);
    const f = sessions[active];
    f.lastActiveTs = t;
    f.tokens += rnd(12000, 38000);

    // advance one kind of work, so a single temper ticks per beat (a clean "refine")
    const r = Math.random();
    if (r < 0.34) f.reads += rnd(1, 3); // dread (searching)
    else if (r < 0.60) { f.linesAdded += rnd(2, 28); if (Math.random() < 0.3) f.linesRemoved += rnd(1, 8); } // frolic
    else if (r < 0.74) { f.linesRemoved += rnd(4, 26); f.linesAdded += rnd(0, 4); } // woe
    else if (r < 0.86) f.fetches += 1; // frolic (fetch)
    else if (r < 0.94) f.commits += 1; // frolic (commit)

    if (Math.random() < 0.55) f.turns.push(mkTurn(f.id, f.turns.length)); // new turn → boxes fill
    if (Math.random() < 0.03) f.turns.push(mkTurn(f.id, f.turns.length, { hung: true })); // dread: a hang

    let stalled = t < stalledUntil;
    if (!stalled && Math.random() < 0.05) {
      f.turns.push(mkTurn(f.id, f.turns.length, { interrupted: true })); // malice: a stall
      stalledUntil = t + 4000;
      stalled = true;
    }

    onSnapshot(buildSnapshot(sessions, stalled));
  };

  const interval = window.setInterval(tick, 750);
  tick();
  return () => window.clearInterval(interval);
}

function buildSnapshot(sessions: DemoSession[], stalled: boolean): Snapshot {
  const out: SessionSnapshot[] = sessions.map((f) => ({
    id: f.id,
    kind: f.kind,
    state: "working",
    parentId: f.parentId,
    turns: f.turns,
    tokens: f.tokens,
    actions: f.reads + f.turns.length * 4,
    lastActiveTs: f.lastActiveTs,
    label: f.label,
    fetches: Array.from({ length: f.fetches }, (_, i) => ({
      id: `${f.id}-fetch-${i}`,
      turnId: f.turns[0]?.id ?? f.id,
      startTs: f.lastActiveTs,
      doneTs: i < f.fetches - 1 ? f.lastActiveTs : undefined,
    })),
    linesAdded: f.linesAdded,
    linesRemoved: f.linesRemoved,
    reads: f.reads,
    commits: f.commits,
  }));
  return {
    ts: Date.now(),
    sessions: out,
    tokens: sessions.reduce((s, f) => s + f.tokens, 0),
    stalled,
    netLines: sessions.reduce((s, f) => s + Math.max(0, f.linesAdded - f.linesRemoved), 0),
  };
}

function rnd(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}
