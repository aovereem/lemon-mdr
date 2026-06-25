/**
 * A single parsed line from a Claude Code transcript, normalized. Server-internal —
 * the browser `src/protocol.ts` doesn't carry this (it only needs the snapshot shape).
 */
export interface Fact {
  sessionId: string;
  /** epoch ms */
  ts: number;
  kind: FactKind;
  /** the tool name when kind === "tool", e.g. "Edit", "Bash", "WebFetch" */
  tool?: string;
  /** present on Task tool use — this session is spawning a subagent */
  spawnsSubagent?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  /** the parent session id, if this fact belongs to a spawned subagent */
  parentSessionId?: string;
  /** raw text (never summarized): a prompt's first line, or a Task description */
  label?: string;
  /** defensive/verification work — tests, lint, typecheck (read from the Bash command) */
  verify?: boolean;
  /** the assistant ended its turn here (stop_reason "end_turn") */
  endsTurn?: boolean;
  /** lines added/removed by an Edit/Write/MultiEdit, counted from the tool's own args */
  linesAdded?: number;
  linesRemoved?: number;
  /** a knowledge-gathering call (Read/Grep/Glob) */
  scouted?: boolean;
  /** this Bash command ran a `git commit` */
  committed?: boolean;
}

export type FactKind =
  | "session_start"
  | "user_prompt"
  | "thinking"
  | "tool"
  | "tool_result"
  | "assistant_text"
  | "error"
  | "session_end";
