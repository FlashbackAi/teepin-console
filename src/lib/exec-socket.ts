/**
 * ExecSocket — the terminal's WebSocket transport, deliberately kept
 * framework-free. A `useState` per output chunk would melt: this class
 * owns the raw byte path (React never sees individual stdout frames),
 * and the terminal-card component only reacts to a handful of lifecycle
 * callbacks (open, exit, error).
 *
 * Wire protocol (mirrors pkg/cluster/exec_handler.go's execClientFrame/
 * execServerFrame): the first frame sent is a JSON "auth" frame carrying
 * the ticket — not a query param, so it never appears in a proxy's
 * access log. After that, binary frames are raw stdin/stdout bytes;
 * JSON text frames carry resize (client->server) and ready/exit/error
 * (server->client).
 */

export class ExecSocket {
  private ws: WebSocket | null = null;
  private ready = false;

  onReady: (() => void) | null = null;
  /** Raw bytes — never pre-decoded. The terminal decodes UTF-8 itself,
   *  correctly handling a multi-byte character split across frames;
   *  decoding here first would risk mangling exactly that case. */
  onData: ((data: Uint8Array) => void) | null = null;
  onExit: ((exitCode: number) => void) | null = null;
  /** Fired for a structured {"type":"error",...} frame OR a bare close
   *  with no such frame (code 1006 etc — some networks block WebSocket
   *  connections outright, and the browser gives no other detail). */
  onError: ((code: string, message: string) => void) | null = null;

  connect(
    attachUrl: string,
    ticketId: string,
    ticketSecret: string,
    rows: number,
    cols: number,
  ) {
    const ws = new WebSocket(attachUrl);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", id: ticketId, secret: ticketSecret, rows, cols }));
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        this.handleControlFrame(ev.data);
        return;
      }
      // binaryType "arraybuffer" guarantees this branch for anything not
      // a text frame.
      this.onData?.(new Uint8Array(ev.data as ArrayBuffer));
    };

    ws.onclose = (ev) => {
      this.ready = false;
      // A structured error frame (handleControlFrame) already reported
      // the reason, if there was one to report — this only covers the
      // bare-close case (no frame at all, e.g. a blocked connection).
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

  private handleControlFrame(raw: string) {
    let frame: { type?: string; code?: string; message?: string; exit_code?: number };
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    switch (frame.type) {
      case "ready":
        this.ready = true;
        this.onReady?.();
        break;
      case "exit":
        this.onExit?.(frame.exit_code ?? 0);
        break;
      case "error":
        this.onError?.(frame.code ?? "unknown", frame.message ?? "The session ended unexpectedly.");
        break;
    }
  }

  sendStdin(data: Uint8Array) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(data);
  }

  sendResize(rows: number, cols: number) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "resize", rows, cols }));
  }

  close() {
    this.ws?.close(1000, "client closed");
    this.ws = null;
    this.ready = false;
  }
}
