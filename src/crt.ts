/**
 * The CRT interaction layer. The signature Macrodata Refinement move: a magnifying
 * bubble follows the cursor — numbers swell and flow radially outward around it (a clear
 * lens in the middle, an enlarged ring at its rim), then flow back as it passes, like a
 * sphere moving under the field. Pure ambience over the number field — no data meaning.
 * The roll bar, bloom, and chromatic fringe are all CSS (see index.html); only this
 * displacement needs per-frame work, so it lives here.
 */
interface CellFx { ox: number; oy: number; sc: number } // current (eased) offset + scale

export class CursorField {
  private cells: HTMLElement[] = [];
  private pos: { x: number; y: number }[] = [];
  private cx = -99999;
  private cy = -99999;
  private fx = new Map<number, CellFx>();
  private readonly R = 80; // bubble radius (px)
  private readonly SWELL = 1.0; // extra scale at the apex (the number under the cursor)
  private readonly SPREAD = 0.22; // how far the ring bulges outward (× R)
  private readonly EASE = 0.26; // flow speed toward the target each frame

  constructor() {
    window.addEventListener("mousemove", (e) => {
      this.cx = e.clientX;
      this.cy = e.clientY;
    });
    window.addEventListener("mouseleave", () => {
      this.cx = -99999;
      this.cy = -99999;
    });
    requestAnimationFrame(this.frame);
  }

  /** Re-cache cell centre positions (called whenever the field rebuilds). */
  setCells(cells: HTMLElement[]): void {
    this.cells = cells;
    this.pos = cells.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    this.fx.clear();
  }

  private frame = (): void => {
    const { R, cx, cy } = this;
    const hasCursor = cx > -9000;

    // Which cells are inside the bubble this frame.
    const inside = new Set<number>();
    if (hasCursor) {
      const R2 = R * R;
      for (let i = 0; i < this.pos.length; i++) {
        const dx = this.pos[i].x - cx;
        const dy = this.pos[i].y - cy;
        if (dx * dx + dy * dy <= R2) inside.add(i);
      }
    }

    // Visit everything inside the bubble plus anything still flowing back to rest.
    const touched = new Set<number>(this.fx.keys());
    for (const i of inside) touched.add(i);

    for (const i of touched) {
      const cell = this.cells[i];
      if (!cell) { this.fx.delete(i); continue; }

      let tox = 0, toy = 0, tsc = 1; // target
      let hot = false;
      if (inside.has(i)) {
        const dx = this.pos[i].x - cx;
        const dy = this.pos[i].y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const t = d / R; // 0 at cursor → 1 at rim
        // A sphere bulging toward you: the number under the cursor rides the apex
        // (biggest, stays put); the ring around it bulges outward along the sphere's
        // curve; the rim is untouched.
        const disp = R * this.SPREAD * Math.sin(t * Math.PI); // 0 at apex, peak mid, 0 at rim
        tox = (dx / d) * disp;
        toy = (dy / d) * disp;
        tsc = 1 + this.SWELL * Math.cos((t * Math.PI) / 2); // max at the apex → 1 at the rim
        hot = t < 0.5;
      }

      let s = this.fx.get(i);
      if (!s) { s = { ox: 0, oy: 0, sc: 1 }; this.fx.set(i, s); }
      s.ox += (tox - s.ox) * this.EASE;
      s.oy += (toy - s.oy) * this.EASE;
      s.sc += (tsc - s.sc) * this.EASE;

      // Settled back to rest and no longer in the bubble → release to CSS drift.
      if (!inside.has(i) && Math.abs(s.ox) < 0.4 && Math.abs(s.oy) < 0.4 && Math.abs(s.sc - 1) < 0.01) {
        cell.style.transform = "";
        cell.style.color = "";
        cell.style.zIndex = "";
        cell.style.animation = ""; // restore the CSS drift
        this.fx.delete(i);
        continue;
      }

      // A running CSS animation outranks inline transform, so suspend drift while the
      // bubble owns this cell — otherwise the displacement never shows.
      cell.style.animation = "none";
      cell.style.transform = `translate(${s.ox.toFixed(1)}px, ${s.oy.toFixed(1)}px) scale(${s.sc.toFixed(3)})`;
      cell.style.color = hot ? "var(--cy-hot)" : s.sc > 1.05 ? "var(--cy)" : "";
      cell.style.zIndex = "2";
    }

    requestAnimationFrame(this.frame);
  };
}
