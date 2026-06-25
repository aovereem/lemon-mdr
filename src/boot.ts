/**
 * The cold-start boot sequence — a Lemon terminal warming up. Pure flavor: a pulsing
 * lemon, the wordmark, and a few cycling status lines, then it fades to reveal the
 * refinement screen. Non-blocking; the data layer connects underneath while this plays.
 */
import { LOGO } from "./logo";

export function runBoot(): void {
  const boot = document.createElement("div");
  boot.id = "boot";
  boot.className = "show";
  boot.innerHTML =
    `<span class="lemon-big" aria-hidden="true">${LOGO}</span>` +
    `<div class="ln">MICRODATA REFINEMENT</div>` +
    `<div class="boot-status" id="boot-status">INITIALIZING REFINEMENT TERMINAL…</div>`;
  document.body.appendChild(boot);

  const lines = [
    "INITIALIZING REFINEMENT TERMINAL…",
    "MOUNTING DATA FILE…",
    "CALIBRATING TEMPERS…",
    "WELCOME",
  ];
  const status = boot.querySelector("#boot-status") as HTMLElement;
  let i = 0;
  const iv = window.setInterval(() => {
    i = Math.min(i + 1, lines.length - 1);
    status.textContent = lines[i];
  }, 650);

  window.setTimeout(() => {
    window.clearInterval(iv);
    boot.className = "show out";
    window.setTimeout(() => boot.remove(), 850);
  }, 2900);
}
