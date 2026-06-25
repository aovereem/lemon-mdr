/**
 * The agent-observer protocol — engine copy. Identical to ../src/protocol.ts (the skin
 * copy). The neutral contract between the engine and a skin: it describes Claude Code
 * agent sessions + turns in plain, theme-free terms. If you edit one copy, edit the other.
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
  subagents: number;
  edited: boolean;
  verified: boolean;
  interrupted: boolean;
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
  tool?: string;
  parentId?: string;
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
  tokens: number;
  netLines: number;
  stalled: boolean;
}

export type ServerMessage =
  | { type: "snapshot"; data: Snapshot }
  | { type: "hello"; data: { version: string; demo: boolean } };

export const STREAM_PATH = "/stream";
