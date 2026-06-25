import type { TurnSnapshot } from "./protocol";

/**
 * The four Lumon tempers, read off a turn's real diff counts. Shared by the boxes
 * (mdr.ts), the turn explorer, and the reward emblems — one definition, no drift.
 * These are interpretive *moods* over real signals, never fabricated work.
 */
export type TemperCode = "WO" | "FC" | "DR" | "MA";

export const TEMPER_ORDER: TemperCode[] = ["WO", "FC", "DR", "MA"];

export const TEMPER_NAME: Record<TemperCode, string> = {
  WO: "WOE",
  FC: "FROLIC",
  DR: "DREAD",
  MA: "MALICE",
};

/** Canonical personification of each temper (Kier Cycle "Taming the Four Tempers"). */
export const TEMPER_FIGURE: Record<TemperCode, string> = {
  WO: "THE GAUNT BRIDE",
  FC: "THE JESTER",
  DR: "THE CRONE",
  MA: "THE RAM",
};

/** The four temper signal values for one turn. */
export function temperValues(t: TurnSnapshot): Record<TemperCode, number> {
  return {
    // Reweighted to comparable per-turn magnitudes (watch ?debug "avg/turn") so a box
    // fills on all four, not just the smallest. All still real signals — only scaled.
    WO: t.linesRemoved, // loss — the reference scale
    FC: t.linesAdded * 0.3 + (t.committed ? 8 : 0), // creation — linesAdded dwarfs the rest, so ×0.3
    // Dread = uncertainty/struggle: exploration (reads), long grinding turns (durationMs),
    // heavy context (tokens), stalls (hung). reads alone was ~30× too thin.
    DR: t.reads * 3 + Math.min(t.durationMs / 5000, 13) + Math.min(t.tokens / 2500, 8) + (t.hung ? 40 : 0),
    // Malice = friction/conflict: a grinding high-action turn (baseline), interrupts, recoveries.
    MA: Math.min(t.actions, 10) * 3.5 + (t.interrupted ? 40 : 0) + (t.verified ? 12 : 0),
  };
}

/** The dominant temper of a value bag (null when everything is zero). */
export function dominant(v: Record<TemperCode, number>): { code: TemperCode | null; name: string } {
  let best: TemperCode | null = null;
  let bv = 0;
  for (const k of TEMPER_ORDER) if (v[k] > bv) { bv = v[k]; best = k; }
  return best ? { code: best, name: TEMPER_NAME[best] } : { code: null, name: "—" };
}
