import type { Fact } from "./fact.js";

/**
 * Synthetic fact feed for `--demo` / `?demo` (no transcripts needed). Pushes plausible
 * Fact objects into the SAME colony the live path uses, so the demo exercises the real
 * reader. Moods are mixed so all four tempers fill: frolic (adds), woe (removes), dread
 * (reads), malice (interrupts/verify). Server-side; the browser src/demo.ts is separate.
 */
const PROMPTS = [
  "build the colony viewer", "refactor the parser for clarity", "fix the flaky watcher test",
  "trim the dead config flags", "wire up the new reward tier", "investigate the slow snapshot",
  "tidy the temper weights", "add the keyboard shortcuts",
];
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function startDemo(onFact: (f: Fact) => void): () => void {
  const queen = "demo-queen-0001";
  const worker = "demo-worker-0002";
  let t = Date.now() - 60_000;
  // seed a founding prompt on each session
  onFact({ sessionId: queen, ts: t, kind: "user_prompt", label: "i want a severance-style observer for my agents" });
  onFact({ sessionId: worker, ts: t + 500, kind: "user_prompt", label: pick(PROMPTS), parentSessionId: queen });

  const iv = setInterval(() => {
    t = Date.now();
    const id = Math.random() < 0.7 ? queen : worker;
    const parent = id === worker ? queen : undefined;
    const r = Math.random();
    if (r < 0.14) {
      onFact({ sessionId: id, ts: t, kind: "user_prompt", label: pick(PROMPTS), parentSessionId: parent });
    } else if (r < 0.46) { // frolic — write code
      onFact({ sessionId: id, ts: t, kind: "tool", tool: "Edit", linesAdded: rnd(8, 70), linesRemoved: rnd(0, 12), tokensOut: rnd(200, 900), parentSessionId: parent });
    } else if (r < 0.60) { // woe — remove code
      onFact({ sessionId: id, ts: t, kind: "tool", tool: "Edit", linesAdded: rnd(0, 6), linesRemoved: rnd(20, 80), tokensOut: rnd(150, 500), parentSessionId: parent });
    } else if (r < 0.80) { // dread — read/explore
      onFact({ sessionId: id, ts: t, kind: "tool", tool: pick(["Read", "Grep", "Glob"]), scouted: true, tokensIn: rnd(1500, 9000), parentSessionId: parent });
    } else if (r < 0.88) { // malice — verify / commit
      onFact({ sessionId: id, ts: t, kind: "tool", tool: "Bash", verify: Math.random() < 0.6, committed: Math.random() < 0.4, tokensOut: rnd(80, 300), parentSessionId: parent });
    } else if (r < 0.93) { // malice — interrupt
      onFact({ sessionId: id, ts: t, kind: "user_prompt", label: "[Request interrupted by user]", parentSessionId: parent });
    } else { // close the turn
      onFact({ sessionId: id, ts: t, kind: "assistant_text", endsTurn: true, tokensOut: rnd(120, 500), parentSessionId: parent });
    }
  }, 650);

  return () => clearInterval(iv);
}
