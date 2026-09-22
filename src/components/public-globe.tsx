"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";

import { useTheme } from "@/components/theme-provider";

type Point = {
  latitude: number;
  longitude: number;
  location_label?: string;
};

const REST_SCALE = 0.95;
const PEAK_SCALE = 1.15;
const ZOOM_IN_MS = 700;
const GROW_MS = 300;
// How long the camera dwells on each host (flag fully visible) and how
// long it takes to pan smoothly to the next one.
const HOLD_MS = 1800;
const TRAVEL_MS = 1000;
// Flag opacity eases in/out at the edges of its hold window rather than
// popping, without shortening how long it reads as fully visible.
const FLAG_FADE_MS = 200;
const MARKER_SIZE = 0.018;
// A radar-style breathing pulse, once fully grown in. Each marker is
// phase-offset by its index so the fleet doesn't blip in unison.
const BLIP_PERIOD_MS = 1600;
const BLIP_MIN = 0.7;
const BLIP_MAX = 1.35;
// Radians of rotation per pixel of horizontal drag movement.
const DRAG_SENSITIVITY = 0.006;

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}
function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Shortest angular delta from `from` to `to`, in (-PI, PI] — lets phi
// interpolate the short way round the globe instead of the long way.
function wrapDelta(from: number, to: number) {
  const raw = to - from;
  return raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
}

/**
 * phi/theta that centre a given (lat, lng) marker directly in view.
 *
 * COBE's marker vertex shader (verified directly against the installed
 * cobe@2.0.1 bundle — this isn't part of its documented public API)
 * rotates each marker's base unit vector `p` (from the same lat/lng
 * formula COBE itself uses) as `l = Rx(theta) * Ry(phi) * p`, and treats
 * a marker as front-facing once `l.z >= 0`. Centring a marker means
 * choosing phi/theta so that rotated point lands at (0, 0, 1) — solving
 * that directly (rather than guessing at the relationship) gives a closed
 * form: phi cancels p's x/z components, theta then cancels the residual
 * y/z tilt.
 */
function lookAt(lat: number, lng: number) {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lng * Math.PI) / 180 - Math.PI;
  const px = -Math.cos(latRad) * Math.cos(lonRad);
  const py = Math.sin(latRad);
  const pz = Math.cos(latRad) * Math.sin(lonRad);
  return { phi: Math.atan2(-px, pz), theta: Math.asin(py) };
}

// Two nodes a few km apart (already reported at ~11km precision server-
// side — see pkg/nodes.PublicNodeLocation) project to well under a
// screen pixel apart on a whole-globe view: no marker-size reduction can
// separate dots whose *centres* already coincide on screen. Rather than
// leave close nodes permanently indistinguishable outside their own tour
// turn, group anything within CLUSTER_DEG of each other and spread the
// group's members around their shared centroid — a display-only nudge
// (both the dot and its camera-lookAt target use the spread position, so
// a host's flag/dot/camera-centre stay self-consistent during its turn).
// The label — already an approximate, self-reported area name, never a
// precise address — is what actually identifies a host; this only makes
// the dot itself findable at a glance.
const CLUSTER_DEG = 1;
const CLUSTER_SPREAD_DEG = 1.6;

function spreadClusters(points: Point[]): Point[] {
  const n = points.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (
        Math.abs(points[i].latitude - points[j].latitude) < CLUSTER_DEG &&
        Math.abs(points[i].longitude - points[j].longitude) < CLUSTER_DEG
      ) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const members = groups.get(root);
    if (members) members.push(i);
    else groups.set(root, [i]);
  }

  const spread = points.map((p) => ({ ...p }));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const centroidLat = members.reduce((s, i) => s + points[i].latitude, 0) / members.length;
    const centroidLng = members.reduce((s, i) => s + points[i].longitude, 0) / members.length;
    const lngScale = Math.max(0.15, Math.cos((centroidLat * Math.PI) / 180));
    members.forEach((i, k) => {
      const angle = (2 * Math.PI * k) / members.length;
      spread[i].latitude = centroidLat + CLUSTER_SPREAD_DEG * Math.sin(angle);
      spread[i].longitude = centroidLng + (CLUSTER_SPREAD_DEG * Math.cos(angle)) / lngScale;
    });
  }
  return spread;
}

type TourPhase = "hold" | "travel";

/**
 * Public-facing fleet globe — a rotating, dotted 3D globe (COBE, ~5KB
 * WebGL, no API key/account/paid provider). This is the same library
 * vercel.com uses for its own "where we run" visual — picked
 * deliberately for this specific, decorative, unauthenticated panel,
 * distinct from the flat, click-to-inspect Leaflet map in Control Centre
 * (node-map.tsx), which is a different job entirely.
 *
 * The camera runs a continuous guided tour rather than idling: it opens
 * already centred on the first host (see `lookAt`), zooms in once, then
 * cycles forever — hold on a host with its white flag shown, pan
 * smoothly to the next, repeat. A host's dot grows in the first time the
 * tour reaches it and stays full-size afterwards. The flag for a host is
 * only ever shown while the camera is actually centred on it (during its
 * hold), never mid-pan — so it can be pinned to the exact centre of the
 * panel instead of tracked against a moving projection.
 *
 * A visitor can drag left/right to spin the globe manually; this adds a
 * temporary offset on top of the tour's own phi that is folded away at
 * the start of the next pan, so the tour always resumes cleanly.
 *
 * Driven by one requestAnimationFrame loop using elapsed wall-clock time,
 * not COBE's documented `onRender` — verified directly against the
 * installed 2.0.1 bundle that this callback does not actually exist in
 * the shipped code despite the README documenting it.
 *
 * Coordinates are already minimized server-side (rounded to ~11km in
 * SQL — see pkg/nodes.PublicNodeLocation). location_label is the
 * operator's own text, shown as-is and by design (see that type's own
 * doc comment and location-dialog.tsx's hint to operators).
 */
export function PublicGlobe({ points }: { points: Point[] }) {
  const { resolved } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flagRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointsKey = points
    .map((p) => `${p.latitude}:${p.longitude}:${p.location_label ?? ""}`)
    .join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper || points.length === 0) return;

    const dark = resolved === "dark";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = wrapper.clientWidth;
    let height = wrapper.clientHeight;

    const displayPoints = spreadClusters(points);
    const targets = displayPoints.map((p) => lookAt(p.latitude, p.longitude));

    // Tour state machine: which host we're on, whether we're holding on
    // it or panning to the next, and (while panning) where we're panning
    // from/to so the interpolation has fixed endpoints.
    let index = 0;
    let phase: TourPhase = "hold";
    let phaseStart = 0;
    let fromPhi = targets[0].phi;
    let fromTheta = targets[0].theta;
    let toPhi = targets[0].phi;
    let toTheta = targets[0].theta;
    let dragOffset = 0;
    const grownAt: (number | null)[] = points.map(() => null);
    grownAt[0] = 0;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: width * dpr,
      height: height * dpr,
      phi: targets[0].phi,
      theta: targets[0].theta,
      dark: dark ? 1 : 0,
      diffuse: 1.2,
      scale: REST_SCALE,
      mapSamples: 16000,
      mapBrightness: dark ? 6 : 5,
      baseColor: dark ? [0.25, 0.25, 0.28] : [0.86, 0.86, 0.89],
      // The app's own --success green (142 71% 45%), converted to
      // normalised RGB — reuses an existing token rather than inventing
      // a new accent colour for a decorative element.
      markerColor: [0.13, 0.77, 0.36],
      glowColor: dark ? [0.15, 0.15, 0.18] : [1, 1, 1],
      markers: displayPoints.map((p) => ({
        location: [p.latitude, p.longitude] as [number, number],
        size: 0,
      })),
    });

    let raf = 0;
    const start = performance.now();

    let dragging = false;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      canvas.style.cursor = "grab";
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      dragOffset += e.movementX * DRAG_SENSITIVITY;
    };
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointercancel", onPointerUp);

    const animate = (ts: number) => {
      const elapsed = ts - start;

      const scale =
        elapsed < ZOOM_IN_MS
          ? REST_SCALE + (PEAK_SCALE - REST_SCALE) * easeOutCubic(elapsed / ZOOM_IN_MS)
          : PEAK_SCALE;

      // Advance the tour's own clock — skip entirely with one host, since
      // there's nowhere to pan to and it should just hold indefinitely.
      if (points.length > 1) {
        const phaseElapsed = ts - phaseStart;
        if (phase === "hold" && phaseElapsed >= HOLD_MS) {
          const next = (index + 1) % points.length;
          fromPhi = targets[index].phi + dragOffset;
          fromTheta = targets[index].theta;
          dragOffset = 0;
          toPhi = targets[next].phi;
          toTheta = targets[next].theta;
          index = next;
          phase = "travel";
          phaseStart = ts;
        } else if (phase === "travel" && phaseElapsed >= TRAVEL_MS) {
          phase = "hold";
          phaseStart = ts;
          dragOffset = 0;
          if (grownAt[index] === null) grownAt[index] = ts;
        }
      }

      let displayPhi: number;
      let displayTheta: number;
      if (phase === "hold") {
        displayPhi = targets[index].phi + dragOffset;
        displayTheta = targets[index].theta;
      } else {
        const t = Math.min(1, (ts - phaseStart) / TRAVEL_MS);
        const eased = easeInOutCubic(t);
        displayPhi = fromPhi + wrapDelta(fromPhi, toPhi) * eased + dragOffset;
        displayTheta = fromTheta + (toTheta - fromTheta) * eased;
      }

      const markers = displayPoints.map((p, i) => {
        const grownSince = grownAt[i];
        const local = grownSince === null ? -1 : ts - grownSince;
        let size: number;
        if (local < 0) {
          size = 0;
        } else if (local < GROW_MS) {
          size = MARKER_SIZE * easeOutCubic(local / GROW_MS);
        } else {
          const phase = (ts / BLIP_PERIOD_MS + i / displayPoints.length) * 2 * Math.PI;
          const pulse = BLIP_MIN + (BLIP_MAX - BLIP_MIN) * (0.5 + 0.5 * Math.sin(phase));
          size = MARKER_SIZE * pulse;
        }
        return { location: [p.latitude, p.longitude] as [number, number], size };
      });

      globe.update({ phi: displayPhi, theta: displayTheta, scale, markers });

      points.forEach((p, i) => {
        const flag = flagRefs.current[i];
        if (!flag) return;
        let opacity = 0;
        if (p.location_label && i === index && phase === "hold") {
          const phaseElapsed = ts - phaseStart;
          const holdDuration = points.length > 1 ? HOLD_MS : Infinity;
          if (phaseElapsed < FLAG_FADE_MS) {
            opacity = phaseElapsed / FLAG_FADE_MS;
          } else if (phaseElapsed > holdDuration - FLAG_FADE_MS) {
            opacity = (holdDuration - phaseElapsed) / FLAG_FADE_MS;
          } else {
            opacity = 1;
          }
        }
        opacity = Math.max(0, Math.min(1, opacity));
        flag.style.opacity = String(opacity);
        flag.style.transform = `translate(-50%, -100%) scale(${0.85 + 0.15 * opacity})`;
      });

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const observer = new ResizeObserver(() => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      globe.update({ width: width * dpr, height: height * dpr });
    });
    observer.observe(wrapper);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointercancel", onPointerUp);
      globe.destroy();
    };
    // points is derived fresh every render; pointsKey is the actual
    // change signal — re-running this whole effect (destroying and
    // recreating the WebGL globe, restarting the tour) on every
    // unrelated re-render would be wasteful and jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, resolved]);

  if (points.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ contain: "layout paint size" }}
      />
      {points.map((p, i) => (
        <div
          key={i}
          ref={(el) => {
            flagRefs.current[i] = el;
          }}
          className="pointer-events-none absolute top-1/2 left-1/2 opacity-0"
          style={{ transform: "translate(-50%, -100%)" }}
        >
          <div className="rounded-sm bg-white px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-neutral-900 shadow-sm">
            {p.location_label}
          </div>
          <div className="mx-auto h-2 w-px bg-white/80" />
        </div>
      ))}
    </div>
  );
}
