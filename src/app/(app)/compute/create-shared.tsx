"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useImagePorts } from "@/lib/api/hooks";
import { formatRate } from "@/lib/utils";

/** Debounces a fast-changing value (a text input) so dependent effects —
 *  like a network lookup — only fire once the user pauses. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Result of trying to auto-detect a port from a container image's own
 *  declared EXPOSE metadata:
 *  - "unknown": no answer yet (empty image field, or the debounced lookup
 *    is still in flight) — the caller should not ask the customer
 *    anything until this settles, to avoid a port field flashing in and
 *    back out.
 *  - "detected": the platform already knows the port. The customer is
 *    never asked — no field, no confirmation, fully automatic, per an
 *    explicit product decision (2026-08-19): asking for something the
 *    platform can already determine on its own is friction with no
 *    payoff for the common case (nginx, postgres, redis, ...).
 *  - "not-found": resolution completed but found nothing (a private
 *    image, no EXPOSE declared, or a registry outside the allowlist —
 *    see pkg/imageinfo's SSRF guard). This is the ONLY case a port field
 *    should ever appear: the platform genuinely does not know, so it
 *    asks the customer directly. */
export type PortDetection =
  | { status: "unknown" }
  | { status: "detected"; port: number }
  | { status: "not-found" };

/** useAutoDetectedPort resolves an image's declared EXPOSE port, 500ms
 *  after the customer stops typing the image field. See PortDetection for
 *  what each result means and how a caller should react to it. */
export function useAutoDetectedPort(image: string): PortDetection {
  const debouncedImage = useDebouncedValue(image.trim(), 500);
  const { data, isSuccess, isError } = useImagePorts(debouncedImage);

  if (!debouncedImage) {
    return { status: "unknown" };
  }
  // A failed LOOKUP (the endpoint unreachable, a network blip) must not
  // become "the customer can never create an instance" — this is a
  // convenience feature, never a hard dependency. Degrade to asking the
  // customer directly, exactly like "resolved, found nothing".
  if (isError) {
    return { status: "not-found" };
  }
  if (!isSuccess || !data) {
    return { status: "unknown" };
  }
  if (data.ports.length === 0) {
    return { status: "not-found" };
  }
  return { status: "detected", port: data.ports[0].port };
}

/** PriceLine shows the hourly rate the customer is agreeing to, before commit.
 *  Shared by the GPU and CPU create dialogs. */
export function PriceLine({ rate }: { rate: number }) {
  return (
    <div className="hairline flex items-baseline justify-between rounded-md border-border bg-muted/50 px-3 py-2.5">
      <span className="text-muted-foreground text-xs">Billed while running</span>
      <span className="tabular text-foreground text-sm font-medium">
        {formatRate(rate)}
      </span>
    </div>
  );
}

/** PaymentGateNotice is the up-front "add a card first" message when the
 *  account has no verified payment method. The backend enforces this (402);
 *  this just turns a post-submit error into an actionable up-front prompt. */
export function PaymentGateNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="hairline rounded-md border-border bg-muted/50 px-3 py-2.5 text-sm">
      <p className="text-foreground font-medium">
        Add a payment method to launch instances
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        A validated card is required before any resource can be created.{" "}
        <Link
          href="/settings/payment"
          className="text-foreground underline"
          onClick={onClose}
        >
          Add a card
        </Link>
        .
      </p>
    </div>
  );
}
