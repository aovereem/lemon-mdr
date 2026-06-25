import { type TemperCode, TEMPER_FIGURE } from "./temper";

// ── Reward art ──────────────────────────────────────────────────────────────
// The four actively-iterated icons live in art.ts (TS consts → reliable hot-reload).
// The rest stay as ?raw SVG slots under src/assets/ (stroke="currentColor", fill="none",
// a viewBox, no width/height, no hardcoded colours — the app tints + glows them).
import { eraser, trap, melon, mde } from "./art";
import waffle from "./assets/perk-waffle.svg?raw";
import seqWaffle from "./assets/seq-waffle.svg?raw";
import seqPlate from "./assets/seq-plate.svg?raw";
import seqBed from "./assets/seq-bed.svg?raw";
import maskWoe from "./assets/mask-woe.svg?raw";
import maskFrolic from "./assets/mask-frolic.svg?raw";
import maskDread from "./assets/mask-dread.svg?raw";
import maskMalice from "./assets/mask-malice.svg?raw";
import { Confetti } from "./confetti";
import { fanfare } from "./sound";

/**
 * The Lumon reward system for the five-box cycle. Two tracks:
 *   Track 1 (quiet) — a box completing earns its dominant temper's personification
 *                     emblem (Gaunt Bride · Jester · Crone · Ram) on the shelf.
 *   Track 2 (loud)  — cycle % crossing 10/25/50/75 fires the perk overlays; a full cycle
 *                     fires the Waffle Party and resets the boxes.
 * Celebrations render in a full-page transparent overlay (the field blurs behind, with
 * bokeh + a CRT entry glitch) — see index.html. Original wireframe art (parody).
 */

const BALANCE_GATE = 0.5; // completed-cycle balance ≥ this → the gold "Refiner of the Quarter" Waffle

export interface BoxModel {
  fileId: string;
  fileLabel: string;
  boxes: { pct: number; dominant: TemperCode | null }[];
  boxFills: number[];
  cyclePct: number;
  cyclesCompleted: number;
  balance: number;
}

interface Reward {
  title: string; sub: string; art: string;
  /** the full-screen event's flavour: dud puff · mid · dance (lights + drumline) · big */
  tier: "dud" | "mid" | "dance" | "big";
  /** also drops a collectible token onto the shelf */
  token?: boolean;
  gold?: boolean;
  /** play the multi-stage Waffle Party sequence instead of a single card */
  seq?: boolean;
}

const EMBLEM: Record<TemperCode, string> = { WO: maskWoe, FC: maskFrolic, DR: maskDread, MA: maskMalice };

const MILESTONES: { at: number; reward: Reward }[] = [
  { at: 10, reward: { title: "PLEASE ENJOY THIS ERASER", sub: "10% refined · a token of Lemon's esteem", art: eraser, tier: "dud", token: true } },
  { at: 25, reward: { title: "A FINGER TRAP", sub: "25% refined · fun, as long as you know how to use it safely", art: trap, tier: "dud", token: true } },
  { at: 50, reward: { title: "MELON BAR", sub: "50% refined · black beauty watermelon, from malaysia", art: melon, tier: "mid" } },
  { at: 75, reward: { title: "MUSIC DANCE EXPERIENCE", sub: "75% refined · thank you for your attendance and participation", art: mde, tier: "dance" } },
];
const WAFFLE_GOLD: Reward = { title: "WAFFLE PARTY", sub: "refiner of the quarter · a balanced soul · the waffles are warm", art: waffle, tier: "big", gold: true, seq: true };
const WAFFLE_PLAIN: Reward = { title: "WAFFLE PARTY", sub: "the file is refined · the boxes reset", art: waffle, tier: "big", seq: true };

interface Track {
  seen: boolean;
  boxFills: number[];
  cycles: number;
  milestones: Set<number>;
}

export class Perks {
  private overlay: HTMLElement;
  private content: HTMLElement;
  private standing: HTMLElement | null;
  private prizes: HTMLElement | null;
  private masks: HTMLElement | null;
  private tracks = new Map<string, Track>();
  private cur: BoxModel | null = null;
  private queue: Reward[] = [];
  private showing = false;
  private timer: number | undefined;
  private confetti = new Confetti();
  private seqTimers: number[] = [];

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.id = "perk-overlay";
    // soft drifting bokeh orbs behind the reward
    const bokeh = document.createElement("div");
    bokeh.className = "bokeh";
    for (let i = 0; i < 7; i++) {
      const o = document.createElement("i");
      const sz = Math.round(70 + Math.random() * 170);
      o.style.width = o.style.height = sz + "px";
      o.style.left = Math.round(Math.random() * 100) + "%";
      o.style.top = Math.round(Math.random() * 100) + "%";
      o.style.setProperty("--bd", (7 + Math.random() * 8).toFixed(1) + "s");
      o.style.setProperty("--bx", Math.round(Math.random() * 60 - 30) + "px");
      o.style.setProperty("--by", Math.round(Math.random() * 60 - 30) + "px");
      o.style.animationDelay = (-Math.random() * 6).toFixed(1) + "s";
      bokeh.appendChild(o);
    }
    this.overlay.appendChild(bokeh);
    // flashing blue/red overhead lights for the Music Dance Experience (tier-dance only)
    const lights = document.createElement("div");
    lights.className = "lights";
    lights.innerHTML = `<i class="l-blue"></i><i class="l-red"></i>`;
    this.overlay.appendChild(lights);
    this.content = document.createElement("div");
    this.content.className = "perk-content";
    this.overlay.appendChild(this.content);
    this.overlay.addEventListener("click", () => this.dismiss());
    document.body.appendChild(this.overlay);
    this.standing = document.getElementById("standing");
    this.prizes = document.getElementById("shelf-prizes");
    this.masks = document.getElementById("shelf-masks");
    this.renderStanding();

    // Preview (DEBUG only, ?debug): keys 1–5 fire each celebration on demand
    // (eraser·trap·melon·MDE·waffle) — gated so a stray keypress can't fake a party on live.
    if (location.search.includes("debug")) {
      window.addEventListener("keydown", (e) => {
        const map: Record<string, Reward> = {
          "1": MILESTONES[0].reward, "2": MILESTONES[1].reward, "3": MILESTONES[2].reward,
          "4": MILESTONES[3].reward, "5": WAFFLE_GOLD,
        };
        const r = map[e.key];
        if (r) this.enqueue(r, "PREVIEW");
      });
    }
  }

  /** Evaluate the current box model and fire newly-earned rewards. The first sighting of
   *  a file/project rolls its standing up SILENTLY (no spam on reconnect / for backlog). */
  check(m: BoxModel): void {
    this.cur = m;
    let t = this.tracks.get(m.fileId);
    if (!t) {
      t = { seen: false, boxFills: m.boxFills.slice(), cycles: m.cyclesCompleted, milestones: new Set() };
      this.tracks.set(m.fileId, t);
    }

    if (!t.seen) {
      t.boxFills = m.boxFills.slice();
      t.cycles = m.cyclesCompleted;
      for (const ms of MILESTONES) if (m.cyclePct >= ms.at) t.milestones.add(ms.at);
      t.seen = true;
      this.renderStanding();
      return;
    }

    // Track 1 — per-box completion → a temper emblem to the shelf.
    m.boxFills.forEach((bf, i) => {
      if (bf > t!.boxFills[i]) {
        const dom = m.boxes[i].dominant;
        if (dom) this.earnEmblem(dom);
      }
      t!.boxFills[i] = bf;
    });

    // Track 2 — cycle-% milestones.
    for (const ms of MILESTONES) {
      if (m.cyclePct >= ms.at && !t.milestones.has(ms.at)) {
        t.milestones.add(ms.at);
        this.enqueue(ms.reward, m.fileLabel);
      }
    }

    // Cycle complete → Waffle Party → reset for the next cycle.
    if (m.cyclesCompleted > t.cycles) {
      t.cycles = m.cyclesCompleted;
      t.milestones = new Set();
      this.enqueue(m.balance >= BALANCE_GATE ? WAFFLE_GOLD : WAFFLE_PLAIN, m.fileLabel);
      this.dropToken(this.prizes, waffle, "thing waffle", "WAFFLE PARTY"); // a persistent trace on the shelf
    }

    this.renderStanding();
  }

  private earnEmblem(c: TemperCode): void {
    this.dropToken(this.masks, EMBLEM[c], "t-" + c.toLowerCase(), TEMPER_FIGURE[c]);
  }

  /** Add a collectible to a shelf group — `into` = the prizes (left) or masks (right) row. */
  private dropToken(into: HTMLElement | null, svg: string, cls: string, title = ""): void {
    if (!into) return;
    const span = document.createElement("span");
    span.className = "emb-wrap " + cls + " new";
    if (title) span.title = title;
    span.innerHTML = `<span class="emb">${svg}</span>`;
    into.appendChild(span);
    while (into.children.length > 9) into.removeChild(into.firstChild as Node);
    window.setTimeout(() => span.classList.remove("new"), 1200);
  }

  private renderStanding(): void {
    if (!this.standing || !this.cur) return;
    // PARTIES = total cycles completed, derived from full history → persists across refreshes.
    this.standing.innerHTML =
      `<b>CYCLE</b> ${this.cur.cyclePct}%` +
      `&nbsp;&nbsp;·&nbsp;&nbsp; <b>BALANCE</b> ${Math.round(this.cur.balance * 100)}%` +
      `&nbsp;&nbsp;·&nbsp;&nbsp; <b>PARTIES</b> ${this.cur.cyclesCompleted}`;
  }

  private enqueue(r: Reward, file: string): void {
    this.queue.push({ ...r, sub: `${r.sub} · ${file.toUpperCase().slice(0, 28)}` });
    if (!this.showing) this.next();
  }

  private next(): void {
    const r = this.queue.shift();
    if (!r) { this.showing = false; return; }
    if (r.seq) { this.waffleSequence(r); return; }
    this.showing = true;
    this.content.innerHTML =
      `<div class="perk-svg">${r.art}</div>` +
      `<div class="perk-title">${r.title}</div><div class="perk-sub">${r.sub}</div>`;
    this.overlay.className = "show tier-" + r.tier + (r.gold ? " gold" : "");
    void this.content.offsetWidth; // restart the entry animation
    this.confetti.burst(r.tier);
    fanfare(r.tier);
    if (r.token) this.dropToken(this.prizes, r.art, "thing"); // a "thing" reward → prizes (left)
    window.clearTimeout(this.timer);
    const hold = r.tier === "big" ? 5200 : r.tier === "dance" ? 4600 : r.tier === "dud" ? 2600 : 3800;
    this.timer = window.setTimeout(() => this.dismiss(), hold);
  }

  private dismiss(): void {
    if (!this.showing) return;
    this.clearSeq();
    this.overlay.className = this.overlay.className + " out";
    window.clearTimeout(this.timer);
    window.setTimeout(() => {
      this.overlay.className = "";
      this.content.className = "perk-content";
      this.content.innerHTML = "";
      this.showing = false;
      this.next();
    }, 500);
  }

  private clearSeq(): void {
    this.seqTimers.forEach((t) => window.clearTimeout(t));
    this.seqTimers = [];
  }

  /** The Waffle Party — a multi-stage finale: the waffles, then the plate turns up with
   *  its message, then the Founder's bed, then the four masks dancing (lights + drumline). */
  private waffleSequence(r: Reward): void {
    this.showing = true;
    const gold = r.gold ? " gold" : "";
    this.overlay.className = "show tier-big" + gold;
    this.confetti.burst("big");
    fanfare("big");
    const stages: { at: number; cls: string; html: string; fx?: () => void }[] = [
      { at: 0, cls: "", html: `<div class="perk-svg">${seqWaffle}</div><div class="perk-title">WAFFLE PARTY</div><div class="perk-sub">${r.sub}</div>` },
      { at: 1700, cls: "stage-plate", html: `<div class="seq-plate"><div class="perk-svg">${seqPlate}</div><div class="plate-text">GO NOW TO THE FOUNDER'S BED</div></div>` },
      { at: 4000, cls: "stage-bed", html: `<div class="perk-svg">${seqBed}</div><div class="perk-title">THE FOUNDER'S BED</div>` },
      {
        at: 6100, cls: "stage-masks",
        html: `<div class="seq-masks"><span class="m t-wo">${maskWoe}</span><span class="m t-fc">${maskFrolic}</span><span class="m t-dr">${maskDread}</span><span class="m t-ma">${maskMalice}</span></div><div class="perk-title">THE FOUR<span class="ins"><span class="caret">^</span><span class="sexy">SEXY</span></span>TEMPERS</div>`,
        fx: () => { this.confetti.burst("mid"); }, // lights + drumline belong to the MDE, not here
      },
    ];
    this.clearSeq();
    for (const s of stages) {
      this.seqTimers.push(window.setTimeout(() => {
        this.content.className = "perk-content " + s.cls;
        this.content.innerHTML = s.html;
        void this.content.offsetWidth;
        s.fx?.();
      }, s.at));
    }
    this.seqTimers.push(window.setTimeout(() => this.dismiss(), 10500));
  }
}
