/**
 * Procedural confetti — a single full-screen canvas, no assets. The tier sets the
 * intensity: "dud" is a pathetic little puff (a Lumon non-celebration), "big" is
 * cannons from the corners plus rain. Cyan + temper colours so it reads on the CRT.
 */
const COLORS = ["#5ef0d6", "#c4fff2", "#ecc14a", "#6fe09a", "#5fa8f0", "#e8705c"];

interface P {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; sz: number; col: string; life: number;
}

export class Confetti {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private parts: P[] = [];
  private raf = 0;

  constructor() {
    this.cv = document.createElement("canvas");
    this.cv.id = "confetti";
    document.body.appendChild(this.cv);
    this.ctx = this.cv.getContext("2d") as CanvasRenderingContext2D;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  }

  private spray(n: number, ox: number, oy: number, ang: number, spread: number, spd: number): void {
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread;
      const s = spd * (0.5 + Math.random());
      this.parts.push({
        x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
        sz: 4 + Math.random() * 6, col: COLORS[(Math.random() * COLORS.length) | 0], life: 1,
      });
    }
  }

  burst(tier: "dud" | "mid" | "dance" | "big"): void {
    const W = this.cv.width, H = this.cv.height;
    if (tier === "dud") {
      // a sad little puff from the centre that immediately gives up
      this.spray(9, W / 2, H * 0.44, -Math.PI / 2, 1.0, 4.5);
    } else if (tier === "mid") {
      this.spray(70, W / 2, H * 0.5, -Math.PI / 2, 2.3, 11);
    } else if (tier === "dance") {
      // a party rain from the top to go with the lights + drumline
      for (let i = 0; i < 90; i++) {
        this.parts.push({
          x: Math.random() * W, y: -10 - Math.random() * H * 0.4,
          vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
          sz: 4 + Math.random() * 6, col: COLORS[(Math.random() * COLORS.length) | 0], life: 1,
        });
      }
    } else {
      // cannons from the bottom corners + rain from the top
      this.spray(110, 36, H - 16, -Math.PI / 3, 0.8, 19);
      this.spray(110, W - 36, H - 16, (-2 * Math.PI) / 3, 0.8, 19);
      for (let i = 0; i < 110; i++) {
        this.parts.push({
          x: Math.random() * W, y: -20 - Math.random() * H * 0.5,
          vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 3,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
          sz: 4 + Math.random() * 7, col: COLORS[(Math.random() * COLORS.length) | 0], life: 1,
        });
      }
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    const ctx = this.ctx, H = this.cv.height;
    ctx.clearRect(0, 0, this.cv.width, H);
    for (const p of this.parts) {
      p.vy += 0.18; // gravity
      p.vx *= 0.99; p.vy *= 0.99;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > H * 0.92) p.life -= 0.04;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz * 0.6);
      ctx.restore();
    }
    this.parts = this.parts.filter((p) => p.life > 0 && p.y < H + 40);
    if (this.parts.length) {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      ctx.clearRect(0, 0, this.cv.width, H);
      this.raf = 0;
    }
  };
}
