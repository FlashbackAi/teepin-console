import type { KumbhaEvent } from "./api/types";

/**
 * KumbhaEventSocket — the build page's live activity feed transport.
 *
 * Read-only, unlike ExecSocket (src/lib/exec-socket.ts): this is the
 * agent pod's own stdout, tailed server-side and forwarded as sanitized
 * JSON text frames (see pkg/kumbha/events.go) — there is no stdin
 * direction here at all, and no binary frames.
 *
 * Wire protocol: the first frame sent is a JSON "auth" frame carrying the
 * ticket — same shape as exec's, for one consistent pattern across both
 * WebSocket endpoints, and for the same reason (a browser cannot set
 * custom headers on a WS handshake, so the ticket has to ride the first
 * frame instead of a header). After that, every server frame is either a
 * KumbhaEvent or a control frame ({"type":"closed"} when the agent's
 * stream ends normally, {"type":"error","code":...,"message":...} for a
 * connection/auth failure).
 *
 * `type: "error"` is used on the wire by BOTH a genuine agent-reported
 * error event (AgentErrorEvent, carrying `summary`) and a control-frame
 * failure (carrying `code`/`message`) — see events.go's wsServerFrame vs.
 * KumbhaEvent. They're told apart by the presence of `code`: only a
 * control frame has one, since the server-side allowlist that sanitizes
 * real events never lets a `code` field through.
 */
export class KumbhaEventSocket {
  private ws: WebSocket | null = null;

  onEvent: ((event: KumbhaEvent) => void) | null = null;
  /** The agent's own stream ended normally (it finished, or the session
   *  closed) — distinct from onError, which means something about the
   *  CONNECTION failed. */
  onClosed: (() => void) | null = null;
  onError: ((code: string, message: string) => void) | null = null;

  connect(attachUrl: string, ticketId: string, ticketSecret: string) {
    const ws = new WebSocket(attachUrl);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", id: ticketId, secret: ticketSecret }));
    };

    ws.onmessage = (ev) => {
      // This endpoint never sends binary frames — everything is JSON text.
      if (typeof ev.data !== "string") return;

      let frame: { type?: string; code?: string; message?: string };
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (frame.type === "closed") {
        this.onClosed?.();
        return;
      }
      if (frame.type === "error" && typeof frame.code === "string") {
        this.onError?.(frame.code, frame.message ?? "The activity stream ended unexpectedly.");
        return;
      }
      // Anything else — including a real agent-reported "error" event
      // (no `code` field) — is a KumbhaEvent for the activity feed.
      this.onEvent?.(frame as KumbhaEvent);
    };

    ws.onclose = (ev) => {
      // A structured control frame (handled above) already reported the
      // reason, if there was one — this only covers a bare close with no
      // frame at all (e.g. a network that blocks WebSocket outright).
      if (!ev.wasClean && ev.code !== 1000) {
        this.onError?.(
          "connection_closed",
          `Connection closed unexpectedly (code ${ev.code}). Some corporate networks block WebSocket connections.`,
        );
      }
    };

    ws.onerror = () => {
      // The WebSocket API deliberately exposes nothing else here — the
      // close event above carries what little detail exists.
    };
  }

  close() {
    this.ws?.close(1000, "client closed");
    this.ws = null;
  }
}
