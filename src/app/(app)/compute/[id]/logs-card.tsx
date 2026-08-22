"use client";

/**
 * Logs — the container's own stdout/stderr, exactly as `kubectl logs`
 * would return them (see pkg/cluster/direct.go's StreamLogs: a direct
 * pass-through of the Kubernetes pods/log API, with no platform-internal
 * logging or secrets ever interleaved — buildPod injects only
 * customer-supplied env vars, never platform ones). That's why this file
 * is entirely about RENDERING quality (colors, search, timestamps) and
 * has no redaction logic: there is nothing platform-confidential in this
 * stream to hide, and mangling a customer's own output would make
 * debugging their own app harder, not safer.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Loading } from "@/components/ui/loading";
import { Input, Select } from "@/components/ui/input";
import { errorMessage, useInstanceLogs } from "@/lib/api/hooks";
import { parseAnsi } from "@/lib/ansi";

const TAIL_OPTIONS = [200, 1000, 5000] as const;

export function LogsCard({
  id,
  ready,
  active,
}: {
  id: string;
  ready: boolean;
  active: boolean;
}) {
  const [tail, setTail] = useState<(typeof TAIL_OPTIONS)[number]>(200);
  const [timestamps, setTimestamps] = useState(false);
  const [search, setSearch] = useState("");
  const [wrap, setWrap] = useState(false);
  const [follow, setFollow] = useState(true);

  const logs = useInstanceLogs(id, ready && active, tail, timestamps);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Set only by the auto-scroll effect below, read only by the scroll
  // handler right after — distinguishes "we just scrolled the view to
  // the bottom programmatically" from "the customer scrolled", so
  // auto-follow doesn't immediately cancel itself on its own scroll event.
  const programmaticScroll = useRef(false);

  const text = logs.data?.logs ?? "";
  const lines = text.length > 0 ? text.split("\n") : [];
  const hasBinaryGarbage = text.includes("�");

  // Auto-scroll to the bottom on new content, only while following.
  useEffect(() => {
    if (!follow || !scrollRef.current) return;
    programmaticScroll.current = true;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text, follow]);

  function onScroll() {
    if (programmaticScroll.current) {
      programmaticScroll.current = false;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    // Only ever turns follow OFF here (the customer scrolled away) —
    // turning it back on is exclusively the "Jump to latest" button, so
    // merely scrolling near the bottom while reading doesn't silently
    // re-enable auto-scroll under them.
    if (!atBottom && follow) setFollow(false);
  }

  function jumpToLatest() {
    setFollow(true);
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      {/* No CardTitle here — the "Logs" tab immediately above this card
          already says so; a second "Logs" label right under it was pure
          duplication. The toolbar strip is the first thing in the card. */}
      <div className="hairline-b border-border bg-muted/30 flex flex-wrap items-center gap-2 px-4 py-2">
        <Input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 max-w-56 flex-1 text-xs"
        />
        <Select
          value={String(tail)}
          onChange={(e) => setTail(Number(e.target.value) as (typeof TAIL_OPTIONS)[number])}
          className="h-7 w-auto text-xs"
        >
          {TAIL_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Last {n}
            </option>
          ))}
        </Select>

        {/* Toggle group: same hairline box as a single control, so
            "Timestamps"/"Wrap" read as one related pair rather than two
            more loose buttons. */}
        <div className="hairline flex overflow-hidden rounded-md border-border">
          <Button
            variant={timestamps ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setTimestamps((v) => !v)}
          >
            Timestamps
          </Button>
          <div className="bg-border w-px shrink-0" />
          <Button
            variant={wrap ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setWrap((v) => !v)}
          >
            Wrap
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <CopyButton value={text} label="Copy" />
          <Button variant="ghost" size="sm" onClick={download} disabled={!text}>
            Download
          </Button>
        </div>
      </div>

      {logs.isLoading ? (
        <Loading className="py-16" />
      ) : logs.isError ? (
        <div className="text-destructive px-4 py-6 text-sm">
          {/* The 503 "capacity unreachable" case already reads distinctly
              here — the backend's own message says so (see
              pkg/api/server.go's GetInstanceLogs), and errorMessage()
              surfaces it verbatim rather than a generic fallback. */}
          {errorMessage(logs.error)}
        </div>
      ) : lines.length === 0 || !text.trim() ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          No output yet.
        </p>
      ) : (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className={[
              "max-h-96 overflow-auto px-4 py-3 text-xs leading-relaxed font-mono",
              wrap ? "whitespace-pre-wrap" : "whitespace-pre",
            ].join(" ")}
          >
            {lines.map((line, i) => (
              <LogLine key={i} line={line} search={search} />
            ))}
          </div>
          {!follow && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="bg-foreground text-background absolute right-4 bottom-3 rounded px-2 py-1 text-xs shadow"
            >
              Jump to latest ↓
            </button>
          )}
          {hasBinaryGarbage && (
            <p className="text-muted-foreground border-border hairline-t px-4 py-1.5 text-[10px]">
              This output contains non-text bytes that could not be
              displayed correctly.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** One log line: ANSI-colored spans, with search matches highlighted
 *  within each span. Two passes rather than one — parseAnsi produces
 *  color/style segments, and search highlighting further splits each
 *  segment's own text without disturbing its style. */
function LogLine({ line, search }: { line: string; search: string }) {
  if (line === "") return <div>&nbsp;</div>;

  const segments = parseAnsi(line);
  return (
    <div>
      {segments.map((seg, i) => (
        <span
          key={i}
          style={{
            color: seg.color,
            fontWeight: seg.bold ? 700 : undefined,
            opacity: seg.dim ? 0.6 : undefined,
          }}
        >
          {highlightSearch(seg.text, search)}
        </span>
      ))}
    </div>
  );
}

function highlightSearch(text: string, search: string) {
  if (!search.trim()) return text;
  // Escape regex metacharacters — the search box is a plain substring
  // match, not a pattern language, so a customer typing "1.2.3" must not
  // have "." treated as "any character".
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === search.toLowerCase() ? (
      <mark key={i} className="bg-warning/40 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
