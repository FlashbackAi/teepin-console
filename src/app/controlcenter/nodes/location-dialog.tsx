"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { admin } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/hooks";
import type { Node } from "@/lib/api/types";

/**
 * Set a node's location — manual/operator-provided only, never derived from
 * IP geolocation (an operator enrolling their own machine knows where it
 * actually is far better than a lookup would guess). Purely informational:
 * shown as a pin on the Control Centre map, no effect on placement or
 * billing. Label alone (no coordinate) is valid — a city/region name with
 * no precise pin.
 */
export function NodeLocationDialog({
  node,
  onClose,
}: {
  node: Node;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(node.location_label ?? "");
  const [lat, setLat] = useState(
    node.latitude !== undefined ? String(node.latitude) : "",
  );
  const [lng, setLng] = useState(
    node.longitude !== undefined ? String(node.longitude) : "",
  );

  const latTrimmed = lat.trim();
  const lngTrimmed = lng.trim();
  const latNum = latTrimmed === "" ? null : Number(latTrimmed);
  const lngNum = lngTrimmed === "" ? null : Number(lngTrimmed);
  const bothOrNeither = (latNum === null) === (lngNum === null);
  const latValid = latNum === null || (Number.isFinite(latNum) && latNum >= -90 && latNum <= 90);
  const lngValid = lngNum === null || (Number.isFinite(lngNum) && lngNum >= -180 && lngNum <= 180);
  const valid = bothOrNeither && latValid && lngValid;

  const save = useMutation({
    mutationFn: () =>
      admin.setNodeLocation(node.id, {
        latitude: latNum,
        longitude: lngNum,
        location_label: label.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "nodes"] });
      onClose();
    },
  });

  return (
    <Dialog
      title="Set location"
      description="Operator-provided, for the map only — not derived from IP, and has no effect on placement or billing."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Label"
          hint="Shown publicly on the sign-in page's globe — use a city/region name (e.g. Bengaluru, India), never a street address or anything identifying. Can stand alone with no coordinate below."
          htmlFor="node-location-label"
        >
          <Input
            id="node-location-label"
            placeholder="Bengaluru, India"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Latitude"
            hint={!latValid ? "Must be between -90 and 90." : undefined}
            htmlFor="node-location-lat"
          >
            <Input
              id="node-location-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              placeholder="12.9716"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
          </Field>
          <Field
            label="Longitude"
            hint={!lngValid ? "Must be between -180 and 180." : undefined}
            htmlFor="node-location-lng"
          >
            <Input
              id="node-location-lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              placeholder="77.5946"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </Field>
        </div>
        {!bothOrNeither && (
          <p className="text-destructive text-xs">
            Set both latitude and longitude, or leave both blank.
          </p>
        )}
        {save.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(save.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}
