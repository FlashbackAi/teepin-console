"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Node } from "@/lib/api/types";

type LocatedNode = Node & { latitude: number; longitude: number };

/**
 * Fleet map — operator-provided node locations (see location-dialog.tsx)
 * plotted with Leaflet + OpenStreetMap's own public tile server. No API
 * key, no account, no paid provider — the map-rendering half of the
 * "OSM instead of a commercial maps SDK" decision; where each pin's
 * coordinate actually comes from is a separate question (migration 046's
 * own comment: manual/operator-provided, never IP geolocation).
 *
 * Leaflet is loaded dynamically inside the effect, not imported at module
 * scope: it touches `window`/`document` at call time, and this component
 * still renders once on the server for the initial HTML like any other
 * "use client" component — a top-level import would run that code during
 * SSR and crash the build. Raw Leaflet, not react-leaflet, mirroring
 * MetricChart's own imperative-library-in-a-ref pattern for ECharts — one
 * established way to wrap a drawing library in this codebase, not two.
 *
 * Markers are plain circleMarkers (a Leaflet core primitive, no icon
 * images) rather than the default pin icon — Leaflet's default marker
 * image paths are famously broken under bundlers, and a coloured dot
 * needs no image asset or CDN reference at all.
 */
export function NodeMap({ nodes }: { nodes: Node[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const located = nodes.filter(
    (n): n is LocatedNode =>
      n.latitude !== undefined && n.longitude !== undefined,
  );
  // Stable primitive so the effect only re-runs when the actual set of
  // pins changes, not on every unrelated re-render of the parent list
  // (a new `nodes` array reference on every poll would otherwise tear
  // down and rebuild the map every ~30s for no visible reason).
  const locatedKey = located
    .map((n) => `${n.id}:${n.latitude}:${n.longitude}:${n.status}`)
    .join("|");

  useEffect(() => {
    const el = containerRef.current;
    if (!el || located.length === 0) return;

    let cancelled = false;
    let map: LeafletMap | undefined;

    import("leaflet").then((L) => {
      if (cancelled || !el) return;

      map = L.map(el, { scrollWheelZoom: false });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      const markers = located.map((n) => {
        // Built as DOM nodes rather than an HTML string passed to
        // bindPopup — node_name/location_label are operator-typed text;
        // textContent keeps them inert regardless of what's in them.
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = n.node_name;
        popup.appendChild(name);
        if (n.location_label) {
          popup.appendChild(document.createElement("br"));
          popup.appendChild(document.createTextNode(n.location_label));
        }
        popup.appendChild(document.createElement("br"));
        popup.appendChild(document.createTextNode(n.status));

        const color = n.status === "online" ? "#22c55e" : "#9ca3af";
        return L.circleMarker([n.latitude, n.longitude], {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.9,
          weight: 1,
        })
          .bindPopup(popup)
          .addTo(map!);
      });

      if (markers.length === 1) {
        map.setView([located[0].latitude, located[0].longitude], 9);
      } else {
        map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
    // located is derived fresh every render; locatedKey is the actual
    // change signal (see its own comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locatedKey]);

  // Nothing to plot is a normal, expected state (no operator has set a
  // location yet) — not an error, so this renders nothing rather than an
  // empty-map placeholder nobody asked for.
  if (located.length === 0) return null;

  return (
    // isolate: Leaflet's internal panes (tiles/markers/popups) use z-index
    // values up to ~700 to layer correctly AMONG THEMSELVES, and with no
    // stacking context of its own here, those values compare directly
    // against the rest of the page — including a modal Dialog's z-50
    // overlay, which the map would otherwise render on top of. isolate
    // (CSS `isolation: isolate`) contains all of that to within this Card,
    // regardless of the numbers involved, so nothing inside the map can
    // ever outrank a dialog mounted outside it.
    <Card className="isolate">
      <CardHeader>
        <CardTitle>Node locations</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="w-full rounded-md"
          style={{ height: 320 }}
        />
      </CardContent>
    </Card>
  );
}
