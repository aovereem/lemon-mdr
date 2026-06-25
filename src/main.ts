import { connect } from "./net";
import { MDR } from "./mdr";
import { startDemo } from "./demo";
import { runBoot } from "./boot";
import { LOGO } from "./logo";

// Drop the Lemon wordmark into the header mark.
const markLogo = document.getElementById("mark-logo");
if (markLogo) markLogo.innerHTML = LOGO;

// Boot the refinement terminal. It tries a live server first (the /colony WebSocket); if
// none answers within a moment, it falls back to the embedded demo feed so the terminal
// is never blank. Force the demo with ?demo.
runBoot();
const mdr = new MDR();
const forceDemo = new URLSearchParams(location.search).has("demo");

let gotLive = false;
let stopDemo: (() => void) | null = null;

function startEmbeddedDemo() {
  if (gotLive || stopDemo) return;
  stopDemo = startDemo((snap) => mdr.onSnapshot(snap));
  mdr.setStatus("connecting"); // the demo is local; status stays muted
}

if (forceDemo) {
  startEmbeddedDemo();
} else {
  // Arm the demo only if nothing answers the shared port. If the server CONNECTS (onStatus
  // "live") we cancel it — so the demo never interleaves fabricated work with real work
  // while we wait for the first snapshot.
  const demoTimer = window.setTimeout(startEmbeddedDemo, 1600);
  connect({
    onSnapshot: (snap) => {
      gotLive = true;
      window.clearTimeout(demoTimer);
      if (stopDemo) { stopDemo(); stopDemo = null; }
      mdr.onSnapshot(snap);
    },
    onStatus: (s) => {
      if (s === "live") window.clearTimeout(demoTimer); // connected → don't arm the demo
      mdr.setStatus(s);
    },
  });
}
