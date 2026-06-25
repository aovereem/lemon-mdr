/**
 * The agent-observer protocol — the neutral contract between the engine (`core/`, which
 * says WHAT each session is doing, read straight from the Claude Code transcript) and a
 * skin (which decides how to render it). Theme-free: it describes agent sessions + turns
 * in plain terms so any skin can map them to its own vocabulary. The engine keeps an
 * identical copy at `core/protocol.ts`; if you edit one, edit the other.
 */

export type SessionKind = "root" | "sub";

export type SessionState = "thinking" | "working" | "writing" | "idle" | "away";

/** One turn of a session — a prompt and the work that answered it. */
export interface TurnSnapshot {
  id: string;
  label: string;
  tokens: number;
  actions: number;
  durationMs: number;
  startTs: number;
  /** subagents spawned during this turn */
  subagents: number;
  edited: boolean;
  /** ran tests/lint/typecheck, or recovered from an error */
  verified: boolean;
  /** cut short by an interrupt */
  interrupted: boolean;
  /** never sealed — the session went idle mid-turn */
  hung?: boolean;
  done: boolean;
  linesAdded: number;
  linesRemoved: number;
  reads: number;
  committed: boolean;
}

/** An external fetch's round-trip (WebFetch / WebSearch). */
export interface FetchSnapshot {
  id: string;
  turnId: string;
  startTs: number;
  doneTs?: number;
}

/** One agent session — a top-level conversation or a spawned subagent. */
export interface SessionSnapshot {
  id: string;
  kind: SessionKind;
  state: SessionState;
  /** the tool driving the current state */
  tool?: string;
  /** the session that spawned this one, if any */
  parentId?: string;
  /** the parent's turn this one forked from */
  parentTurnId?: string;
  turns: TurnSnapshot[];
  tokens: number;
  actions: number;
  lastActiveTs: number;
  label?: string;
  fetches: FetchSnapshot[];
  linesAdded: number;
  linesRemoved: number;
  reads: number;
  commits: number;
}

/** Everything the engine knows at one instant. */
export interface Snapshot {
  ts: number;
  sessions: SessionSnapshot[];
  /** total tokens across all sessions */
  tokens: number;
  /** total net lines added (Σ max(0, added − removed)) */
  netLines: number;
  /** true while a session is stuck on an unrecovered error */
  stalled: boolean;
}

/** Messages the engine pushes over the WebSocket. */
export type ServerMessage =
  | { type: "snapshot"; data: Snapshot }
  | { type: "hello"; data: { version: string; demo: boolean } };

export const STREAM_PATH = "/stream";
