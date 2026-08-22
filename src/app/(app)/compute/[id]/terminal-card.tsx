"use client";

/**
 * Terminal — "Connect to instance" from the console, AWS-Session-Manager
 * style. No SSH keys, no open ports: the browser gets a short-lived
 * ticket (api.createExecSession), then opens a WebSocket carrying it as
 * the first frame (ExecSocket, src/lib/exec-socket.ts), which the
 * control plane bridges into the target instance's own agent tunnel.
 *
 * Loaded via next/dynamic({ssr:false}) from page.tsx — xterm touches
 * `window` at import time, so this file must never be imported
 * server-side.
 */

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/hooks";
import { wsBaseUrl } from "@/lib/api/client";
import { ExecSocket } from "@/lib/exec-socket";
import { ANSI } from "@/lib/ansi";

// Only the chrome (background/foreground/cursor/selection) follows the
// console's own theme tokens — the 16 ANSI colors above come from the
// shared palette (src/lib/ansi.ts), also used by the logs viewer's own
// parser so a "red" line reads the same in both places.

const THEME_DARK = {
  background: "#181818",
  foreground: "#f5f5f5",
  cursor: "#f5f5f5",
  selectionBackground: "#3a3a3a",
  ...ANSI,
};

const THEME_LIGHT = {
  background: "#ffffff",
  foreground: "#121212",
  cursor: "#121212",
  selectionBackground: "#d6d6d6",
  ...ANSI,
};

type SessionState = "idle" | "connecting" | "connected" | "ended";

// Client-side inactivity cutoff, AWS-Session-Manager style — independent
// of the server's own 15-minute idle timeout (that one is the backstop
// for a closed/backgrounded tab; this one gives fast, visible feedback
// while the tab is open). Reset on BOTH directions of traffic: input-only
// would kill a session mid `npm install` while output is visibly
// streaming, which is worse than leaving it open.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export default function TerminalCard({ id, active }: { id: string; active: boolean }) {
  const { resolved } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<ExecSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<SessionState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  // Separate from `state`: the idle cutoff closes the SOCKET but
  // deliberately leaves the terminal (and its scrollback) mounted and
  // visible underneath an overlay, rather than tearing down to the
  // "idle"/pre-connect view the way disconnect() does.
  const [idleTimedOut, setIdleTimedOut] = useState(false);

  // Live-update the terminal's colors on theme toggle — no remount, no
  // reconnect.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = resolved === "dark" ? THEME_DARK : THEME_LIGHT;
    }
  }, [resolved]);

  // Re-fit when this tab becomes the visible one. page.tsx keeps both
  // panels mounted (CSS `hidden`, not unmounted) so the session survives
  // switching tabs — but a `display:none` container measures 0 width,
  // so fit() while hidden would compute a garbage column count. Fitting
  // again on the transition back to visible corrects it.
  useEffect(() => {
    if (active && fitRef.current && containerRef.current && containerRef.current.clientWidth > 0) {
      fitRef.current.fit();
    }
  }, [active]);

  // Unmount cleanup only — teardown is stable (defined in this closure
  // but only ever called on unmount or explicit disconnect/reconnect,
  // never re-created in a way that matters here).
  useEffect(() => teardown, []);

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function resetIdleTimer() {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      // Close only the socket — the terminal and its scrollback stay
      // exactly as they were, visible under the overlay below, until the
      // customer reconnects or refreshes the page.
      socketRef.current?.close();
      socketRef.current = null;
      setIdleTimedOut(true);
    }, IDLE_TIMEOUT_MS);
  }

  function teardown() {
    clearIdleTimer();
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }

  async function connect() {
    setState("connecting");
    setMessage(null);
    setIdleTimedOut(false);
    try {
      const ticket = await api.createExecSession(id);

      const term = new Terminal({
        theme: resolved === "dark" ? THEME_DARK : THEME_LIGHT,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 12,
        lineHeight: 1.4,
        cursorBlink: true,
        scrollback: 5000,
        convertEol: false,
        allowProposedApi: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);

      if (!containerRef.current) return;
      term.open(containerRef.current);
      // Glyph metrics aren't final until the font has actually loaded —
      // fitting before that computes the wrong column count. Also guard
      // on clientWidth: connect() can in principle run while this panel
      // is the hidden one (CSS `display:none`, not unmounted — see
      // page.tsx), where fit() would size against 0 and get it wrong;
      // the active-tab effect above re-fits once it becomes visible.
      await document.fonts.ready;
      if (containerRef.current.clientWidth > 0) fit.fit();

      termRef.current = term;
      fitRef.current = fit;

      const socket = new ExecSocket();
      socketRef.current = socket;

      socket.onReady = () => {
        setState("connected");
        term.focus();
        resetIdleTimer();
      };
      socket.onData = (data) => {
        term.write(data);
        resetIdleTimer();
      };
      socket.onExit = (exitCode) => {
        clearIdleTimer();
        term.write(`\r\n\x1b[2m[session ended — exit code ${exitCode}]\x1b[0m\r\n`);
        setState("ended");
      };
      socket.onError = (code, msg) => {
        clearIdleTimer();
        term.write(`\r\n\x1b[2m[session ended: ${msg}]\x1b[0m\r\n`);
        setMessage(errorForCode(code, msg));
        setState("ended");
      };

      const attachUrl = `${wsBaseUrl()}${ticket.attach_path}`;
      socket.connect(attachUrl, ticket.ticket_id, ticket.ticket_secret, term.rows, term.cols);

      // Terminal input -> stdin. xterm already turns keypresses into the
      // correct escape sequences; nothing here needs a keymap. Encoded
      // to bytes explicitly rather than relying on the socket to do it,
      // so a multi-byte character typed via IME goes over as one frame.
      const encoder = new TextEncoder();
      term.onData((data) => {
        socket.sendStdin(encoder.encode(data));
        resetIdleTimer();
      });
      term.onBinary((data) => {
        const bytes = Uint8Array.from(data, (c) => c.charCodeAt(0) & 0xff);
        socket.sendStdin(bytes);
        resetIdleTimer();
      });

      // Resize: only a genuine dimension change reaches the wire (via
      // xterm's own onResize, not the ResizeObserver callback directly)
      // — a window drag would otherwise spam the shared node stream with
      // dozens of resize messages.
      let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
      term.onResize(({ rows, cols }) => {
        if (resizeDebounce) clearTimeout(resizeDebounce);
        resizeDebounce = setTimeout(() => socket.sendResize(rows, cols), 100);
      });

      // Guarded the same way as the initial fit above: a resize firing
      // while this panel is hidden must not size against 0.
      const observer = new ResizeObserver(() => {
        if (containerRef.current && containerRef.current.clientWidth > 0) fit.fit();
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;
    } catch (e) {
      setMessage(errorMessage(e));
      setState("idle");
    }
  }

  function disconnect() {
    teardown();
    setState("idle");
    setMessage(null);
    setIdleTimedOut(false);
  }

  function reconnect() {
    teardown();
    setState("idle");
    setMessage(null);
    setIdleTimedOut(false);
    void connect();
  }

  return (
    <Card>
      {/* No CardTitle — the "Terminal" tab immediately above this card
          already says so; matches the same fix on the Logs card. */}
      <CardHeader className="flex flex-row items-center justify-end">
        {state === "idle" && (
          <Button variant="primary" size="sm" onClick={connect}>
            Connect
          </Button>
        )}
        {state === "connecting" && (
          <Button variant="primary" size="sm" disabled>
            Connecting…
          </Button>
        )}
        {(state === "connected" || state === "ended") && (
          <div className="flex items-center gap-2">
            {(state === "ended" || idleTimedOut) && (
              <Button variant="ghost" size="sm" onClick={reconnect}>
                Reconnect
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={disconnect}>
              {state === "connected" && !idleTimedOut ? "Disconnect" : "Close"}
            </Button>
          </div>
        )}
      </CardHeader>

      {state === "idle" ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          {message ?? "Connect to get an interactive shell in this instance."}
        </p>
      ) : (
        <div className="border-border hairline-t px-4 py-3">
          <div className="relative">
            <div
              ref={containerRef}
              className="h-96 overflow-hidden rounded"
              // xterm renders its own background per the theme above —
              // this is only a fallback while the terminal is still
              // initializing, so there's no flash of the page background.
              style={{ background: resolved === "dark" ? THEME_DARK.background : THEME_LIGHT.background }}
            />
            {/* Overlay ON TOP of the terminal, not a line of text below
                it (AWS Session Manager style) — the scrollback stays
                visible underneath, dimmed, so the customer can still
                read what was on screen when the session cut out. */}
            {idleTimedOut && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded bg-black/70 text-center">
                <p className="px-6 text-sm text-white">
                  Session ended after 5 minutes of inactivity.
                </p>
                <Button variant="primary" size="sm" onClick={reconnect}>
                  Reconnect
                </Button>
              </div>
            )}
          </div>
          {state === "ended" && message && (
            <p className="text-destructive mt-2 text-xs">{message}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function errorForCode(code: string, fallback: string): string {
  switch (code) {
    case "no_shell":
      return "This image has no shell — /bin/bash and /bin/sh are both missing. Distroless and scratch images can't be attached to; use logs, or rebuild with a shell.";
    case "node_offline":
      return "The node hosting this instance is unreachable right now. Your instance is unaffected; try again shortly.";
    case "node_unreachable":
      return "The node hosting this instance became unreachable mid-session.";
    case "too_many":
      return "This node is already running the maximum number of terminal sessions.";
    case "idle":
      return "Closed after 15 minutes with no activity.";
    case "expired":
      return "The session ticket expired or was already used — click Connect to try again.";
    case "attach_timeout":
      return "This node did not respond in time — it may not support terminal sessions yet.";
    case "not_found":
      return "Instance not found.";
    default:
      return fallback;
  }
}
