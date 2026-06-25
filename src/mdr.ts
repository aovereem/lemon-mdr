import type { SessionSnapshot, Snapshot } from "./protocol";
import { CursorField } from "./crt";
import { Perks, type BoxModel } from "./perks";
import { Explorer } from "./explorer";
import { temperValues, dominant, TEMPER_ORDER, type TemperCode } from "./temper";

/**
 * The Macrodata Refinement renderer. Every Claude
 * Code session is a "file" being refined. Its turns drop, one by one, into five boxes
 * (01–05); each box holds the four tempers (Woe·Frolic·Dread·Malice). When all five fill,
 * the file earns a Waffle Party and the boxes RESET to refine again — the turn history
 * keeps accruing. Nothing here is generated beyond the transcript counts the server sends.
 */

const BOX_COUNT = 5;
const BOX_CAPACITY = 1000; // signal per box per cycle (project-wide aggregate) — the cadence dial

// Add ?debug to the URL to dump real per-box/per-temper totals + bottlenecks to the console.
const DEBUG = location.search.includes("debug");
let lastDump = -1;
let lastBurst = 0;
const CELL_W = 26;
const CELL_H = 30;
const MAX_CELLS = 1200;

/** Lumon-style file codenames (à la the show's MDR files), assigned stably per project. */
const PROJECT_NAMES = [
  "COLD HARBOR", "SIENA", "ALLENTOWN", "DRANESVILLE", "CAIRNS", "COLEMAN", "EMINENCE",
  "JESUP", "KINGSPORT", "LE MARS", "LONGBRANCH", "MINSK", "NARVA", "OCULA", "PACIS",
  "SUNSET PARK", "TUMWATER", "WAYNESBORO", "WELLINGTON", "MOONBEAM", "NANNING", "ASTORIA",
];

interface BoxEls {
  el: HTMLElement;
  fill: HTMLElement;
  pct: HTMLElement;
  bars: Record<TemperCode, HTMLElement>;
}

/** What each temper reads off real work — surfaced only as a hover title on the box bars,
 *  so the four letters stay mysterious at a glance but reward a curious hover. */
const TEMPER_INFO: Record<TemperCode, string> = {
  WO: "WOE · loss — lines removed",
  FC: "FROLIC · creation — lines added, commits",
  DR: "DREAD · uncertainty — reads, long turns, heavy context, stalls",
  MA: "MALICE · conflict — grinding turns, interrupts, recoveries",
};

export class MDR {
  private head = document.getElementById("file-name")!;
  private meta = document.getElementById("file-meta")!;
  private pctEl = document.getElementById("pct")!;
  private tabsEl = document.getElementById("tabs")!;
  private fieldEl = document.getElementById("field")!;
  private boxesEl = document.getElementById("bins")!;
  private screen = document.getElementById("screen")!;
  private statusEl = document.getElementById("status")!;

  private cells: HTMLElement[] = [];
  private cols = 0;
  private boxes: BoxEls[] = [];
  /** per-file: turns seen (to animate a new turn landing) */
  private boxTrack = new Map<string, { turns: number; seen: boolean; work: number[] }>();
  private pinnedId: string | null = null;
  private lastAlarm = false;
  private cursorField = new CursorField();
  private perks = new Perks();
  private explorer = new Explorer();
  private byId = new Map<string, SessionSnapshot>();

  constructor() {
    this.buildBoxes();
    this.buildField();
    let t: number | undefined;
    window.addEventListener("resize", () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => this.buildField(), 150);
    });
    this.wireCrosshair();
    this.ambientLoop();
  }

  setStatus(s: "connecting" | "live" | "lost"): void {
    this.statusEl.textContent = s === "connecting" ? "connecting…" : s;
    this.statusEl.className = s === "live" ? "live" : s === "lost" ? "lost" : "";
  }

  onSnapshot(snap: Snapshot): void {
    // Two views of the same project, kept deliberately separate:
    //   • the SESSION LIST (tabs + header session count) is TOP-LEVEL only — subagents
    //     (parentId set) stay out of the tabs so the row isn't cluttered with delegated work.
    //   • the WORK AGGREGATE (boxes · % · parties · pours) folds in ALL sessions, parent
    //     AND subagents — so a model fanning out a fleet of subagents looks as busy as it
    //     really is, instead of going quiet because the work happened "off-tab".
    if (!snap || !Array.isArray(snap.sessions)) return; // ignore malformed frames
    const all = snap.sessions;
    const top = all
      .filter((b) => !b.parentId)
      .sort((a, b) => b.lastActiveTs - a.lastActiveTs);
    if (top.length === 0) {
      this.renderIdle();
      return;
    }
    // founding session (oldest top-level) = the project's stable identity. Keying the perks
    // track off it means switching project/server re-triggers a SILENT rollup instead of
    // replaying every milestone + waffle loudly.
    let root = top[0];
    let rootTs = Infinity;
    for (const f of top) {
      const ts = f.turns[0]?.startTs ?? f.lastActiveTs;
      if (ts < rootTs) { rootTs = ts; root = f; }
    }

    this.renderTabs(top);
    this.renderHeader(root, top, all);
    this.renderBoxes(all, root.id); // boxes / % / parties / pours = whole PROJECT incl. subagents
    this.byId = new Map(top.map((b) => [b.id, b]));
    this.explorer.refresh(this.byId);

    // A stall: a fresh interrupt/error somewhere → the whole screen trembles once.
    if (snap.stalled && !this.lastAlarm) this.tremor();
    this.lastAlarm = snap.stalled;
  }

  /** No live sessions — hold an idle "awaiting file" screen (the field still drifts). */
  private renderIdle(): void {
    this.head.textContent = "AWAITING FILE";
    this.meta.textContent = "—";
    this.pctEl.textContent = "00%";
    this.tabsEl.innerHTML = "";
    this.tabsEl.dataset.sig = "";
    this.boxes.forEach((b) => {
      b.fill.style.width = "0%";
      b.pct.textContent = "0%";
      b.el.classList.remove("done");
      TEMPER_ORDER.forEach((c) => (b.bars[c].style.width = "0%"));
    });
    // Don't leave the dead project's standing readout or a frozen explorer behind.
    const standing = document.getElementById("standing");
    if (standing) standing.innerHTML = "";
    this.explorer.close();
  }

  // ── header (the PROJECT, not the selected tab) ────────────────────────────
  private renderHeader(root: SessionSnapshot, top: SessionSnapshot[], all: SessionSnapshot[]): void {
    // A stable thematic codename per project (hashed off the founding session).
    const name = PROJECT_NAMES[hash(root.id) % PROJECT_NAMES.length];
    if (this.head.textContent !== name) this.head.textContent = name;
    // Sessions = top-level (the tabs); turns = ALL work incl. subagents (what fills the boxes).
    const turns = all.reduce((s, f) => s + f.turns.length, 0);
    const code = "0x" + hash(root.id).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
    this.meta.textContent =
      `${code} · ${top.length} SESSION${top.length === 1 ? "" : "S"} · ${turns} TURN${turns === 1 ? "" : "S"}`;
  }

  private renderTabs(files: SessionSnapshot[]): void {
    const sig = files.map((f) => f.id).join("|");
    if (this.tabsEl.dataset.sig === sig) {
      const cur = (this.pinnedId && files.find((f) => f.id === this.pinnedId)) || files[0];
      this.tabsEl.querySelectorAll<HTMLElement>(".tab").forEach((t) =>
        t.classList.toggle("on", t.dataset.id === cur.id),
      );
      return;
    }
    this.tabsEl.dataset.sig = sig;
    this.tabsEl.innerHTML = "";
    const cur = (this.pinnedId && files.find((f) => f.id === this.pinnedId)) || files[0];
    for (const f of files) {
      const tab = document.createElement("div");
      tab.className = "tab" + (f.id === cur.id ? " on" : "");
      tab.dataset.id = f.id;
      const full = (f.label || f.id).toUpperCase();
      tab.textContent = full.slice(0, 22);
      tab.title = full;
      tab.tabIndex = 0;
      tab.setAttribute("role", "tab");
      const activate = () => {
        this.pinnedId = f.id;
        this.tabsEl.querySelectorAll<HTMLElement>(".tab").forEach((t) =>
          t.classList.toggle("on", t.dataset.id === f.id),
        );
        this.explorer.show(this.byId.get(f.id) ?? f);
      };
      tab.onclick = activate;
      tab.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
        else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const tabs = [...this.tabsEl.querySelectorAll<HTMLElement>(".tab")];
          tabs[tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1)]?.focus();
        }
      };
      this.tabsEl.appendChild(tab);
    }
  }

  // ── boxes ─────────────────────────────────────────────────────────────────
  private buildBoxes(): void {
    this.boxesEl.innerHTML = "";
    this.boxes = [];
    for (let i = 0; i < BOX_COUNT; i++) {
      const id = ("0" + (i + 1)).slice(-2);
      const el = document.createElement("div");
      el.className = "box";
      el.dataset.b = String(i);
      const bars = TEMPER_ORDER.map(
        (c) =>
          `<div class="tbar" title="${TEMPER_INFO[c]}"><span class="tl">${c}</span><span class="tt"><span class="tf t-${c.toLowerCase()}" data-t="${c}"></span></span></div>`,
      ).join("");
      el.innerHTML =
        `<div class="box-pop"><span class="bx-cap">${id}</span>${bars}</div>` +
        `<div class="box-lid" aria-hidden="true"><span class="flap flap-l"></span><span class="flap flap-r"></span></div>` +
        `<div class="box-num"><span class="bid">${id}</span></div>` +
        `<div class="box-bar"><span class="bfill"></span><span class="bpct">0%</span></div>`;
      this.boxesEl.appendChild(el);
      const bmap = {} as Record<TemperCode, HTMLElement>;
      el.querySelectorAll<HTMLElement>(".tf").forEach((tf) => (bmap[tf.dataset.t as TemperCode] = tf));
      this.boxes.push({
        el,
        fill: el.querySelector(".bfill") as HTMLElement,
        pct: el.querySelector(".bpct") as HTMLElement,
        bars: bmap,
      });
      // hover/focus opens the temper popover; click or Enter/Space pins it open
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", "refinement box " + id);
      el.addEventListener("mouseenter", () => el.classList.add("hover"));
      el.addEventListener("mouseleave", () => el.classList.remove("hover"));
      el.addEventListener("focus", () => el.classList.add("hover"));
      el.addEventListener("blur", () => el.classList.remove("hover"));
      el.addEventListener("click", () => el.classList.toggle("pin"));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.classList.toggle("pin"); }
      });
    }
  }

  /** Recompute the five boxes from EVERY session's turns (the project), drive the DOM,
   *  animate a new turn landing, set the header %, and hand the model to the rewards. */
  private renderBoxes(files: SessionSnapshot[], projectKey: string): void {
    const C = BOX_CAPACITY;
    const TC = C / 4; // each temper fills its OWN sub-capacity and caps there
    const per = Array.from({ length: BOX_COUNT }, () => ({ WO: 0, FC: 0, DR: 0, MA: 0, total: 0 }));
    // Assign each turn to a box in chronological order: mostly its arbitrary hash bucket,
    // but redirected to the emptiest box whenever the hash bucket has run > one cycle ahead —
    // random like the show, yet no box can be permanently starved into stalling the Waffle.
    const turns = files.flatMap((f) => f.turns);
    turns.sort((a, b) => (a.startTs ?? 0) - (b.startTs ?? 0));
    const totalTurns = turns.length;
    for (const t of turns) {
      const v = temperValues(t);
      let b = hash(t.id) % BOX_COUNT;
      let lo = 0;
      for (let i = 1; i < BOX_COUNT; i++) if (per[i].total < per[lo].total) lo = i;
      if (per[b].total - per[lo].total > TC) b = lo; // hash box too far ahead → feed the laggard
      const p = per[b];
      p.WO += v.WO; p.FC += v.FC; p.DR += v.DR; p.MA += v.MA;
      p.total += v.WO + v.FC + v.DR + v.MA;
    }
    const model: BoxModel = {
      fileId: projectKey,
      fileLabel: this.head.textContent || "PROJECT",
      boxes: [],
      boxFills: [],
      cyclePct: 0,
      cyclesCompleted: 0,
      balance: 0,
    };
    let pctSum = 0;
    const boxCycs: number[] = [];
    per.forEach((p, i) => {
      // a box completes a cycle only when ALL FOUR tempers have reached TC
      const boxCyc = Math.min(
        Math.floor(p.WO / TC), Math.floor(p.FC / TC),
        Math.floor(p.DR / TC), Math.floor(p.MA / TC),
      );
      boxCycs.push(boxCyc);
      const fill: Record<TemperCode, number> = {
        WO: Math.max(0, Math.min(p.WO - boxCyc * TC, TC)),
        FC: Math.max(0, Math.min(p.FC - boxCyc * TC, TC)),
        DR: Math.max(0, Math.min(p.DR - boxCyc * TC, TC)),
        MA: Math.max(0, Math.min(p.MA - boxCyc * TC, TC)),
      };
      const pct = Math.round(((fill.WO + fill.FC + fill.DR + fill.MA) / C) * 100);
      pctSum += pct;
      const dom = dominant({ WO: p.WO, FC: p.FC, DR: p.DR, MA: p.MA });
      model.boxes.push({ pct, dominant: dom.code });
      model.boxFills.push(boxCyc);
      const be = this.boxes[i];
      be.fill.style.width = pct + "%";
      be.pct.textContent = pct + "%";
      be.el.classList.toggle("done", pct >= 100);
      TEMPER_ORDER.forEach((c) => (be.bars[c].style.width = Math.round((fill[c] / TC) * 100) + "%"));
    });
    model.cyclesCompleted = Math.min(...boxCycs);
    model.cyclePct = Math.round(pctSum / BOX_COUNT);

    // Balance = how even the four tempers were across the cycle that just COMPLETED (not the
    // post-reset remainders). Track cumulative temper totals at each cycle boundary; the delta
    // since the last boundary is "this cycle", measured the moment it finishes.
    // Balance = how even the four tempers are across the most RECENT cycle's worth of turns
    // (a sliding window sized to ~one cycle). Shows a real number on static history, slides
    // smoothly on live work, never pegs — the actual texture of recent refinement, and what
    // gold/plain reads. Large sample (≥40 turns) so it can't jitter to the floor.
    const W = Math.max(40, Math.round(totalTurns / (model.cyclesCompleted + 1)));
    const rv = { WO: 0, FC: 0, DR: 0, MA: 0 };
    for (const t of turns.slice(-W)) { const v = temperValues(t); rv.WO += v.WO; rv.FC += v.FC; rv.DR += v.DR; rv.MA += v.MA; }
    const rvals = [rv.WO, rv.FC, rv.DR, rv.MA];
    const rsum = rvals.reduce((a, b) => a + b, 0) || 1;
    model.balance = 1 - rvals.reduce((a, v) => a + Math.abs(v - rsum / 4), 0) / (2 * rsum);

    if (DEBUG) {
      (window as unknown as { __mdr: unknown }).__mdr = { turns: totalTurns, TC, per, boxCycs, parties: model.cyclesCompleted, cyclePct: model.cyclePct };
      const head = `[MDR]  ${totalTurns} turns · TC ${TC} · PARTIES ${model.cyclesCompleted} · cycle ${model.cyclePct}% · bal ${Math.round(model.balance * 100)}% · burst ${lastBurst}`;
      const tt = per.reduce((a, p) => ({ WO: a.WO + p.WO, FC: a.FC + p.FC, DR: a.DR + p.DR, MA: a.MA + p.MA }), { WO: 0, FC: 0, DR: 0, MA: 0 });
      const av = (x: number) => (totalTurns ? x / totalTurns : 0).toFixed(1);
      const avgLine = `avg/turn   WO ${av(tt.WO)}  FC ${av(tt.FC)}  DR ${av(tt.DR)}  MA ${av(tt.MA)}`;
      const lines = per.map((p, i) => {
        const m: Record<TemperCode, number> = { WO: p.WO, FC: p.FC, DR: p.DR, MA: p.MA };
        const neck = TEMPER_ORDER.reduce((a, b) => (m[a] <= m[b] ? a : b));
        const cells = TEMPER_ORDER.map((c) => `${c}${String(Math.round(m[c])).padStart(5)}`).join("  ");
        return `${String(i + 1).padStart(2, "0")}  ${cells}   ▸${neck} ${Math.round(m[neck] % TC)}/${TC} ×${boxCycs[i]}`;
      });
      let panel = document.getElementById("mdr-debug");
      if (!panel) { panel = document.createElement("pre"); panel.id = "mdr-debug"; document.body.appendChild(panel); }
      panel.textContent = head + "\n" + avgLine + "\n" + lines.join("\n");
      if (totalTurns !== lastDump) { lastDump = totalTurns; console.log("%c" + head, "color:#5ef0d6;font-weight:bold"); }
    }


    this.pctEl.textContent = String(model.cyclePct).padStart(2, "0") + "%";

    // Animate the WORK that accrued since the last snapshot: each box that gained signal
    // pours a burst sized to its gain. Robust to when a turn is "counted" (fires as the
    // work actually lands), and several boxes can light at once.
    const tr = this.boxTrack.get("__project__");
    const curWork = per.map((p) => p.total);
    if (tr && tr.seen && tr.work) {
      let fired = 0;
      per.forEach((_p, i) => {
        const delta = curWork[i] - (tr.work[i] ?? curWork[i]);
        if (delta >= 8) {
          const n = Math.max(1, Math.min(6, Math.round(delta / 25)));
          this.landInBox(i, n);
          fired += n;
        }
      });
      if (fired) lastBurst = fired;
    }
    this.boxTrack.set("__project__", { turns: totalTurns, seen: true, work: curWork });

    this.perks.check(model);
  }

  /** Pour `n` clumps into box `b`: the lid opens, the clumps gather + flow in (staggered),
   *  then the lid closes. `n` is sized to the work that just landed in this box. */
  private landInBox(b: number, n: number): void {
    const be = this.boxes[b];
    if (!be) return;
    be.el.classList.add("landing");
    for (let i = 0; i < n; i++) window.setTimeout(() => this.clumpFlow(be.el), i * 420);
    window.setTimeout(() => be.el.classList.remove("landing"), n * 420 + 1300);
  }

  /** Light a "scary" cluster — it swells, the digits gather above the box, then pour in. */
  private clumpFlow(target: HTMLElement): void {
    if (this.cells.length === 0) return;
    const center = Math.floor(Math.random() * this.cells.length);
    const size = 6 + Math.floor(Math.random() * 5);
    const lit: HTMLElement[] = [];
    for (let k = 0; k < size; k++) {
      const idx =
        center + (Math.floor(Math.random() * 3) - 1) * this.cols + (Math.floor(Math.random() * 3) - 1);
      const cell = this.cells[idx];
      if (!cell || lit.includes(cell)) continue;
      cell.classList.add("hot");
      cell.textContent = String(Math.floor(Math.random() * 10));
      lit.push(cell);
    }
    // let the cluster swell first, then lift each digit to a gather point above the box
    window.setTimeout(() => {
      const r = target.getBoundingClientRect();
      const gx = r.left + r.width / 2;   // gather above the box…
      const gy = r.top - 40;
      const bx = r.left + r.width / 2;   // …then down into it
      const by = r.top + 5;
      lit.forEach((cell, i) => this.streak(cell, gx, gy, bx, by, i * 45));
      // the digits that flew off leave HOLES, which re-randomize and fade back after a bit
      lit.forEach((c) => {
        c.classList.remove("hot");
        c.classList.add("hole");
        c.textContent = "";
        window.setTimeout(() => {
          c.textContent = String(Math.floor(Math.random() * 10));
          c.classList.remove("hole");
          c.classList.add("refill");
          window.setTimeout(() => c.classList.remove("refill"), 900);
        }, 2200 + Math.random() * 2600);
      });
    }, 720);
  }

  /** A digit lifts off the field, combines with the others ABOVE the box (slow), then
   *  pours down into it as if sucked in (faster, accelerating). */
  private streak(from: HTMLElement, gx: number, gy: number, bx: number, by: number, delay: number): void {
    const r = from.getBoundingClientRect();
    const s = document.createElement("span");
    s.className = "streak";
    s.textContent = from.textContent || "0";
    s.style.left = r.left + "px";
    s.style.top = r.top + "px";
    document.body.appendChild(s);
    // stage A — drift up and gather, growing slightly
    window.setTimeout(() => {
      s.style.transform = `translate(${(gx - r.left).toFixed(1)}px, ${(gy - r.top).toFixed(1)}px) scale(1.3)`;
    }, delay + 20);
    // stage B — pour/suck down into the box
    window.setTimeout(() => {
      s.style.transition = "transform 0.5s cubic-bezier(.55,0,.85,.4), opacity 0.5s ease-in";
      s.style.transform = `translate(${(bx - r.left).toFixed(1)}px, ${(by - r.top).toFixed(1)}px) scale(0.3)`;
      s.style.opacity = "0";
    }, delay + 1050);
    window.setTimeout(() => s.remove(), delay + 1750);
  }

  // ── the number field ──────────────────────────────────────────────────────
  private buildField(): void {
    const w = this.fieldEl.clientWidth || window.innerWidth;
    const h = this.fieldEl.clientHeight || window.innerHeight - 240;
    this.cols = Math.max(8, Math.floor(w / CELL_W));
    let rows = Math.max(4, Math.floor(h / CELL_H));
    while (this.cols * rows > MAX_CELLS) rows--;
    this.fieldEl.style.gridTemplateColumns = `repeat(${this.cols}, ${CELL_W}px)`;
    this.fieldEl.innerHTML = "";
    this.cells = [];
    const total = this.cols * rows;
    for (let i = 0; i < total; i++) {
      const s = document.createElement("span");
      s.className = "num";
      s.textContent = String(Math.floor(Math.random() * 10));
      s.style.setProperty("--d", (2.4 + Math.random() * 2.8).toFixed(2) + "s");
      s.style.setProperty("--o", (-Math.random() * 3).toFixed(2) + "s");
      s.style.lineHeight = CELL_H + "px";
      this.fieldEl.appendChild(s);
      this.cells.push(s);
    }
    this.cursorField.setCells(this.cells);
  }

  /** Idle shimmer — flip a few random digits so the field never reads as frozen. */
  private ambientLoop(): void {
    window.setInterval(() => {
      if (this.cells.length === 0) return;
      for (let k = 0; k < 6; k++) {
        const c = this.cells[Math.floor(Math.random() * this.cells.length)];
        c.textContent = String(Math.floor(Math.random() * 10));
      }
    }, 1100);
  }

  private tremor(): void {
    this.screen.classList.add("stall");
    window.setTimeout(() => this.screen.classList.remove("stall"), 520);
  }

  private wireCrosshair(): void {
    const cross = document.getElementById("cross")!;
    const hide = () => (cross.style.display = "none");
    window.addEventListener("mousemove", (e) => {
      cross.style.display = "block";
      cross.style.left = e.clientX + "px";
      cross.style.top = e.clientY + "px";
    });
    window.addEventListener("mouseleave", hide);
    window.addEventListener("blur", hide);
  }
}

/** Tiny stable string hash → a Lumon-looking file code. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
