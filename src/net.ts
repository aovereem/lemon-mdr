import { type Snapshot, type ServerMessage, STREAM_PATH } from "./protocol";

export interface NetHandlers {
  onSnapshot: (snap: Snapshot) => void;
  onStatus: (status: "connecting" | "live" | "lost") => void;
}

/** Connects to the lemon-mdr server over the /colony WebSocket and auto-reconnects. The
 *  server is read-only; this is purely a viewer. When no server is reachable, main.ts
 *  falls back to the embedded demo feed. */
export function connect(handlers: NetHandlers): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}${STREAM_PATH}`;

  const open = () => {
    handlers.onStatus("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => handlers.onStatus("live");
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "snapshot") handlers.onSnapshot(msg.data);
    };
    ws.onclose = () => {
      handlers.onStatus("lost");
      setTimeout(open, 1500);
    };
    ws.onerror = () => ws.close();
  };

  open();
}
