// The Python backend's live events (each sign, each finished turn), for the page.
//
// Normally they arrive over a WebSocket. Some browsers refuse a WebSocket where they accept the page
// itself: an iPhone opening the laptop's https address, whose certificate is home-made (phone mode).
// The page loads, but no signs ever arrive. So when the socket cannot open while the backend is
// reachable, the same events are fetched a few times a second instead (GET /events), which those
// browsers do allow. Add ?events=poll to the page address to force that way (for testing).

interface Handlers {
  /** Connected (again). */
  onOpen?: () => void;
  /** The backend stopped answering. The channel keeps trying by itself. */
  onDown?: () => void;
  onEvent: (ev: unknown) => void;
}

const SOCKET_WAIT_MS = 2500;
const RETRY_MS = 1500;
const POLL_MS = 300;

const forced = (): boolean => {
  try { return new URLSearchParams(window.location.search).get("events") === "poll"; } catch { return false; }
};
// Remembered while the page is open: don't wait again for a socket that this browser never opens.
let socketsRefused = typeof window !== "undefined" && forced();

export function openBridgeEvents(base: string, h: Handlers): { close(): void } {
  let closed = false;
  let ws: WebSocket | null = null;
  let timer = 0;
  let everOpened = false;

  const poll = () => {
    let after = -1, misses = 0, up = false;
    const tick = async () => {
      if (closed) return;
      try {
        const r = await fetch(`${base}/events?after=${after}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { last: number; events: unknown[] };
        if (closed) return;
        misses = 0;
        if (!up) { up = true; h.onOpen?.(); }
        after = d.last;
        d.events.forEach((e) => h.onEvent(e));
      } catch {
        if (++misses === 6 && !closed) { up = false; h.onDown?.(); }
      }
      if (!closed) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
  };

  const socket = () => {
    if (closed) return;
    let s: WebSocket;
    try { s = new WebSocket(base.replace(/^http/, "ws") + "/ws?replay=0"); } catch { socketsRefused = true; poll(); return; }
    ws = s;
    let opened = false;
    // a socket that neither opens nor fails: stop waiting for it
    const giveUp = window.setTimeout(() => {
      if (opened || closed) return;
      socketsRefused = true;
      s.onclose = null;
      try { s.close(); } catch { /* noop */ }
      poll();
    }, SOCKET_WAIT_MS);
    s.onopen = () => { opened = true; everOpened = true; clearTimeout(giveUp); h.onOpen?.(); };
    s.onmessage = (m) => {
      let ev: unknown;
      try { ev = JSON.parse(String(m.data)); } catch { return; }
      h.onEvent(ev);
    };
    s.onclose = () => {
      clearTimeout(giveUp);
      if (closed) return;
      const again = () => { h.onDown?.(); timer = window.setTimeout(socket, RETRY_MS); };
      // It was working, so the backend went away: wait for it.
      if (opened || everOpened) { again(); return; }
      // It never opened. Is the backend down, or does this browser refuse the socket? Ask the plain way.
      fetch(`${base}/events?after=-1`, { cache: "no-store" })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); if (!closed) { socketsRefused = true; poll(); } })
        .catch(() => { if (!closed) again(); });
    };
  };

  if (socketsRefused) poll(); else socket();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
    },
  };
}
