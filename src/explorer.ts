import type { SessionSnapshot, TurnSnapshot } from "./protocol";
import { temperValues, dominant } from "./temper";

/**
 * The turn file explorer — a floating, draggable, resizable window opened by clicking a
 * session tab. Two panes: left lists the session's turns as folders (named by each turn's
 * prompt, tagged with a temper chip), right shows the selected turn's TURN_0xNN.dat
 * properties. Everything is read from the real TurnSnapshots — nothing generated.
 *
 * Subagents are deferred: a turn that spawned them just shows a "+N sub" flag for now.
 */

const FOLDER = `<svg viewBox="0 0 24 18" aria-hidden="true"><path d="M2 4 h7 l2 2 h11 v10 h-20 z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
const FILEIC = `<svg viewBox="0 0 18 22" aria-hidden="true"><path d="M3 2 h8 l4 4 v14 h-12 z M11 2 v4 h4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;

export class Explorer {
  private win: HTMLElement;
  private titleEl: HTMLElement;
  private leftEl: HTMLElement;
  private rightEl: HTMLElement;
  private file: SessionSnapshot | null = null;
  private sel = 0;
  private open = false;
  private placed = false;
  private sortDesc = false; // false = oldest-first, true = newest-first

  constructor() {
    this.win = document.createElement("div");
    this.win.id = "explorer";
    this.win.innerHTML =
      `<div class="exwin-bar" id="exDrag"><span class="exwin-title" id="exTitle"></span>` +
      `<span class="exwin-x" id="exClose" role="button" tabindex="0" aria-label="close">✕</span></div>` +
      `<div class="exwin-body"><div class="exwin-left" id="exLeft"></div><div class="exwin-right" id="exRight"></div></div>` +
      `<div class="exwin-grip" id="exGrip" aria-hidden="true"></div>`;
    document.body.appendChild(this.win);
    this.titleEl = this.win.querySelector("#exTitle") as HTMLElement;
    this.leftEl = this.win.querySelector("#exLeft") as HTMLElement;
    this.rightEl = this.win.querySelector("#exRight") as HTMLElement;
    const closeBtn = this.win.querySelector("#exClose") as HTMLElement;
    closeBtn.addEventListener("click", () => this.close());
    closeBtn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.close(); } });
    this.dragWith(this.win.querySelector("#exDrag") as HTMLElement);
    this.resizeWith(this.win.querySelector("#exGrip") as HTMLElement);
    window.addEventListener("keydown", (e) => { if (this.open && e.key === "Escape") this.close(); });
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Open (or re-aim) the window for a session. */
  show(file: SessionSnapshot): void {
    const switching = this.file?.id !== file.id;
    this.file = file;
    if (switching) this.sel = Math.max(0, file.turns.length - 1); // land on the latest turn
    this.open = true;
    if (!this.placed) {
      const w = 660, h = 430;
      this.win.style.width = w + "px";
      this.win.style.height = h + "px";
      this.win.style.left = Math.max(12, Math.round((window.innerWidth - w) / 2)) + "px";
      this.win.style.top = "96px";
      this.placed = true;
    }
    this.win.classList.add("on");
    this.render();
  }

  close(): void {
    this.open = false;
    this.win.classList.remove("on");
  }

  /** Live refresh from the latest snapshot while open. */
  refresh(byId: Map<string, SessionSnapshot>): void {
    if (!this.open || !this.file) return;
    const fresh = byId.get(this.file.id);
    if (fresh) { this.file = fresh; this.render(); }
  }

  private render(): void {
    if (!this.file) return;
    const f = this.file;
    if (this.sel > f.turns.length - 1) this.sel = Math.max(0, f.turns.length - 1); // tasks can shrink
    this.titleEl.textContent = (f.label || f.id).toUpperCase().slice(0, 46);

    if (f.turns.length === 0) {
      this.leftEl.innerHTML = `<div class="exph">no turns yet</div>`;
    } else {
      const order = f.turns.map((_, i) => i);
      if (this.sortDesc) order.reverse();
      this.leftEl.innerHTML =
        `<div class="exph">${f.turns.length} TURN${f.turns.length === 1 ? "" : "S"}` +
        `<span class="exsort" id="exSort" role="button" tabindex="0">${this.sortDesc ? "▼ NEWEST" : "▲ OLDEST"}</span></div>` +
        order.map((i) => {
          const t = f.turns[i];
          const tp = temper(t);
          const nm = (t.label || `turn ${i + 1}`).slice(0, 40);
          return `<div class="exrow${i === this.sel ? " on" : ""}" data-i="${i}" tabindex="0" title="${esc(t.label || "")}">${FOLDER}` +
            `<span class="nm">${esc(nm)}</span><span class="sz">${kfmt(t.tokens)}</span>` +
            `<span class="tg tg-${tp.code.toLowerCase()}">${tp.code}</span></div>`;
        }).join("");
      this.leftEl.querySelectorAll<HTMLElement>(".exrow").forEach((r) => {
        const pick = () => { this.sel = Number(r.dataset.i); this.render(); };
        r.addEventListener("click", pick);
        r.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      });
      const toggleSort = (e: Event) => { e.stopPropagation(); this.sortDesc = !this.sortDesc; this.render(); };
      const sortEl = this.leftEl.querySelector<HTMLElement>("#exSort");
      sortEl?.addEventListener("click", toggleSort);
      sortEl?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(e); } });
    }

    const t = f.turns[this.sel];
    this.rightEl.innerHTML = t ? this.fileView(t) : `<div class="exph">select a turn</div>`;
  }

  private fileView(t: TurnSnapshot): string {
    const tp = temper(t);
    const flags = [
      t.edited && "edited", t.verified && "verify", t.committed && "commit",
      t.interrupted && "interrupted", t.hung && "hung",
    ].filter(Boolean).join(" · ") || "—";
    const sub = t.subagents > 0 ? ` · +${t.subagents} sub` : "";
    const kv = (k: string, v: string, dim = false) =>
      `<div class="exkv"><span class="k">${k}</span><span class="v${dim ? " dim" : ""}">${v}</span></div>`;
    return `<div class="exfile">` +
      `<div class="exfh">${FILEIC} TURN_0x${hex(strhash(t.id) & 0xff)}.dat</div>` +
      kv("tokens", t.tokens.toLocaleString()) +
      kv("actions", String(t.actions)) +
      kv("duration", fmtDur(t.durationMs)) +
      kv("lines", `+${t.linesAdded} / −${t.linesRemoved}`) +
      kv("reads", String(t.reads)) +
      kv("temper", tp.name) +
      kv("flags", esc(flags + sub), true) +
      `<div class="exprompt">"${esc((t.label || "—").slice(0, 240))}"</div>` +
      `</div>`;
  }

  private dragWith(handle: HTMLElement): void {
    handle.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).id === "exClose") return;
      e.preventDefault();
      const rect = this.win.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      const move = (ev: MouseEvent) => {
        const x = Math.min(window.innerWidth - 80, Math.max(0, ev.clientX - ox));
        const y = Math.min(window.innerHeight - 30, Math.max(0, ev.clientY - oy));
        this.win.style.left = x + "px";
        this.win.style.top = y + "px";
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("blur", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("blur", up); // released off-window → don't strand the drag
    });
  }

  private resizeWith(grip: HTMLElement): void {
    grip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.win.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, sw = rect.width, sh = rect.height;
      const move = (ev: MouseEvent) => {
        this.win.style.width = Math.max(380, sw + (ev.clientX - sx)) + "px";
        this.win.style.height = Math.max(240, sh + (ev.clientY - sy)) + "px";
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("blur", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("blur", up); // released off-window → don't strand the drag
    });
  }
}

/** The dominant temper of a single turn (shared helper in temper.ts). */
function temper(t: TurnSnapshot): { code: string; name: string } {
  const d = dominant(temperValues(t));
  return { code: d.code ?? "··", name: d.name };
}

const kfmt = (n: number): string => (n >= 1000 ? Math.round(n / 1000) + "k" : String(n));
const hex = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
/** Stable per-turn code from its id (so TURN_0xNN.dat tracks identity, not row position). */
const strhash = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const fmtDur = (ms: number): string => {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};
const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
