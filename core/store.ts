import type {
  SessionKind,
  SessionSnapshot,
  SessionState,
  Snapshot,
  TurnSnapshot,
} from "./protocol.js";
import type { Fact } from "./fact.js";

const IDLE_MS = 30_000; // no facts for this long → idle
const AWAY_MS = 120_000; // ... this long → away
const GONE_MS = 600_000; // ... this long → drop (only when not persistent)
const STUCK_MS = 8_000; // a session must stay errored this long to raise the stall flag
const ACTIVE_CAP = 120_000; // a gap longer than this between a turn's facts is idle, not work
const HUNG_MS = 300_000; // an open turn idle this long never sealed (killed/crashed mid-turn)

interface Turn {
  label: string;
  tokens: number;
  actions: number;
  startTs: number;
  endTs: number;
  activeMs: number;
  lastTs: number;
  hung: boolean;
  subagents: number;
  edited: boolean;
  verified: boolean;
  interrupted: boolean;
  done: boolean;
  linesAdded: number;
  linesRemoved: number;
  reads: number;
  committed: boolean;
}

interface FetchRec {
  id: string;
  turnId: string;
  startTs: number;
  doneTs?: number;
}

interface Session {
  id: string;
  kind: SessionKind;
  parentId?: string;
  parentTurnId?: string;
  state: SessionState;
  tool?: string;
  turns: Turn[];
  totalTokens: number;
  totalActions: number;
  lastActiveTs: number;
  errored: boolean;
  erroredSince: number;
  label?: string;
  fetches: FetchRec[];
  fetchSeq: number;
  linesAdded: number;
  linesRemoved: number;
  reads: number;
  commits: number;
}

/**
 * The in-memory model. Feed it facts; ask it for a snapshot. Each session is a chain of
 * turns; subagents record which parent session + turn they forked from. The whole engine
 * is theme-free — a skin renders the Snapshot however it likes.
 */
export class Store {
  private sessions = new Map<string, Session>();

  /** persistent = a project/dir-scoped run: keep every session, never auto-prune. */
  constructor(private persistent = false) {}

  ingest(fact: Fact): void {
    const s = this.session(fact.sessionId, fact.parentSessionId);
    s.lastActiveTs = fact.ts;

    // any new activity means a fetch that was in flight has landed
    for (const f of s.fetches) if (f.doneTs === undefined && fact.ts > f.startTs) f.doneTs = fact.ts;

    if (fact.kind === "error") {
      if (!s.errored) { s.errored = true; s.erroredSince = fact.ts; }
      const open = this.openTurn(s);
      if (open) open.verified = true; // a turn that hit an error is defensive work
      return;
    }
    s.errored = false; // any other activity = the session is moving again

    if (fact.kind === "user_prompt") { this.startTurn(s, fact); return; }
    if (fact.kind === "session_end") { s.state = "away"; this.sealOpen(s, fact.ts); return; }

    // tool / thinking / tool_result / assistant_text / session_start → accrue work
    const t = this.ensureTurn(s, fact.ts);
    const gap = fact.ts - t.lastTs;
    if (gap > 0) t.activeMs += Math.min(gap, ACTIVE_CAP);
    t.lastTs = fact.ts;
    if (fact.tokensIn) { s.totalTokens += fact.tokensIn; t.tokens += fact.tokensIn; }
    if (fact.tokensOut) { s.totalTokens += fact.tokensOut; t.tokens += fact.tokensOut; }

    switch (fact.kind) {
      case "tool":
        s.tool = fact.tool;
        s.state = "working";
        s.totalActions += 1;
        t.actions += 1;
        if (isEdit(fact.tool)) t.edited = true;
        if (fact.linesAdded) { t.linesAdded += fact.linesAdded; s.linesAdded += fact.linesAdded; }
        if (fact.linesRemoved) { t.linesRemoved += fact.linesRemoved; s.linesRemoved += fact.linesRemoved; }
        if (fact.scouted) { t.reads += 1; s.reads += 1; }
        if (fact.committed) { t.committed = true; s.commits += 1; }
        if (fact.verify) t.verified = true;
        if (fact.spawnsSubagent) t.subagents += 1;
        if (isFetch(fact.tool)) {
          s.fetches.push({ id: `${s.id}#f${s.fetchSeq++}`, turnId: `${s.id}#${s.turns.indexOf(t)}`, startTs: fact.ts });
          if (s.fetches.length > 10) s.fetches.splice(0, s.fetches.length - 10);
        }
        break;
      case "thinking":
        s.state = "thinking";
        s.tool = undefined;
        break;
      case "assistant_text":
        s.state = "writing";
        break;
      case "session_start":
        s.state = "thinking";
        break;
      case "tool_result":
        break;
    }

    if (fact.endsTurn) this.sealOpen(s, fact.ts);
  }

  /** Drop a session entirely — when a continuation file supersedes its predecessor. */
  dropSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  snapshot(now = Date.now()): Snapshot {
    const sessions: SessionSnapshot[] = [];
    let tokens = 0;
    let netLines = 0;
    let stalled = false;

    for (const s of this.sessions.values()) {
      const age = now - s.lastActiveTs;
      if (!this.persistent && age > GONE_MS) { this.sessions.delete(s.id); continue; }

      let state = s.state;
      if (state !== "away") {
        if (age > AWAY_MS) state = "away";
        else if (age > IDLE_MS) state = "idle";
      }

      const last = s.turns[s.turns.length - 1];
      if (last && !last.done && age > HUNG_MS) { this.seal(last, s.lastActiveTs); last.hung = true; }

      tokens += s.totalTokens;
      netLines += Math.max(0, s.linesAdded - s.linesRemoved);
      if (s.errored && now - s.erroredSince >= STUCK_MS && age < AWAY_MS) stalled = true;

      const turns: TurnSnapshot[] = s.turns.map((t, i) => ({
        id: `${s.id}#${i}`,
        label: t.label,
        tokens: t.tokens,
        actions: t.actions,
        durationMs: t.activeMs, // ACTIVE time (idle gaps excluded), not wall-clock
        startTs: t.startTs,
        subagents: t.subagents,
        edited: t.edited,
        verified: t.verified,
        interrupted: t.interrupted,
        done: t.done,
        hung: t.hung,
        linesAdded: t.linesAdded,
        linesRemoved: t.linesRemoved,
        reads: t.reads,
        committed: t.committed,
      }));

      sessions.push({
        id: s.id,
        kind: s.kind,
        state,
        tool: s.tool,
        parentId: s.parentId,
        parentTurnId: s.parentTurnId,
        turns,
        tokens: s.totalTokens,
        actions: s.totalActions,
        lastActiveTs: s.lastActiveTs,
        label: s.label,
        fetches: s.fetches
          .filter((f) => f.doneTs === undefined || now - f.doneTs < 8000)
          .map((f) => ({ id: f.id, turnId: f.turnId, startTs: f.startTs, doneTs: f.doneTs })),
        linesAdded: s.linesAdded,
        linesRemoved: s.linesRemoved,
        reads: s.reads,
        commits: s.commits,
      });
    }

    return { ts: now, sessions, tokens, netLines, stalled };
  }

  private session(id: string, parentId?: string): Session {
    let s = this.sessions.get(id);
    if (!s) {
      const parent = parentId ? this.sessions.get(parentId) : undefined;
      const parentTurn = parent ? this.openTurn(parent) ?? parent.turns[parent.turns.length - 1] : undefined;
      const parentTurnId = parent && parentTurn ? `${parent.id}#${parent.turns.indexOf(parentTurn)}` : undefined;
      s = {
        id,
        kind: parentId ? "sub" : "root",
        parentId,
        parentTurnId,
        state: "thinking",
        turns: [],
        totalTokens: 0,
        totalActions: 0,
        lastActiveTs: Date.now(),
        errored: false,
        erroredSince: 0,
        fetches: [],
        fetchSeq: 0,
        linesAdded: 0,
        linesRemoved: 0,
        reads: 0,
        commits: 0,
      };
      this.sessions.set(id, s);
    }
    return s;
  }

  private startTurn(s: Session, fact: Fact): void {
    // An interrupt ("[Request interrupted by user]") isn't a new turn — it ends the current
    // one. Seal it (interrupted) and wait for the real next prompt.
    if (fact.label?.startsWith("[Request interrupted")) {
      const open = this.openTurn(s);
      if (open) { open.interrupted = true; this.seal(open, fact.ts); }
      return;
    }
    if (!s.label && fact.label) s.label = fact.label;
    const cur = this.openTurn(s);
    if (cur && cur.tokens === 0 && cur.actions === 0) {
      if (fact.label) cur.label = fact.label;
      cur.startTs = fact.ts;
    } else {
      if (cur) this.seal(cur, fact.ts);
      s.turns.push(this.newTurn(fact.label ?? "", fact.ts));
    }
    s.state = "thinking";
  }

  private ensureTurn(s: Session, ts: number): Turn {
    const last = s.turns[s.turns.length - 1];
    if (last && !last.done) return last;
    const t = this.newTurn("", ts);
    s.turns.push(t);
    return t;
  }

  private openTurn(s: Session): Turn | undefined {
    const last = s.turns[s.turns.length - 1];
    return last && !last.done ? last : undefined;
  }

  private sealOpen(s: Session, ts: number): void {
    const cur = this.openTurn(s);
    if (cur) this.seal(cur, ts);
  }

  private seal(t: Turn, ts: number): void {
    t.done = true;
    t.endTs = ts;
  }

  private newTurn(label: string, ts: number): Turn {
    return { label, tokens: 0, actions: 0, startTs: ts, endTs: ts, activeMs: 0, lastTs: ts, hung: false, subagents: 0, edited: false, verified: false, interrupted: false, done: false, linesAdded: 0, linesRemoved: 0, reads: 0, committed: false };
  }
}

function isEdit(tool: string | undefined): boolean {
  if (!tool) return false;
  const t = tool.toLowerCase();
  return t === "edit" || t === "write" || t === "multiedit" || t === "notebookedit";
}

/** External fetches — the only thing that sends a request to the surface. */
function isFetch(tool: string | undefined): boolean {
  if (!tool) return false;
  const t = tool.toLowerCase();
  return t === "webfetch" || t === "websearch";
}
