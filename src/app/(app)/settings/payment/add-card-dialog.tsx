"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { errorMessage, keys } from "@/lib/api/hooks";

/**
 * Add-card dialog.
 *
 * Card data is entered in Stripe's Payment Element — an iframe Stripe
 * serves and controls, so the raw card number never touches our DOM or
 * our servers (we hold only a token afterwards). We validate with a
 * SetupIntent (no charge); confirmSetup runs 3-D Secure if the bank
 * requires it. The card is not usable until Stripe's webhook confirms it,
 * so on success we invalidate the list and let the webhook-updated status
 * flow in — the row appears as `pending`, then `verified`.
 */

// Loaded once per page. The publishable key is safe to ship to the
// browser (that is its purpose); an empty key disables the flow.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

export function AddCardDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const elementRef = useRef<HTMLDivElement>(null);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);

  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards the SetupIntent creation against React's StrictMode, which in
  // development mounts→unmounts→remounts every effect to surface
  // non-idempotent side effects. A plain `let` resets on the remount and
  // would let the second run fire a SECOND createSetupIntent — each of
  // which creates a pending card, so one click produced two "Validating…"
  // rows. A ref persists across the remount, so the second run sees the
  // guard set and skips the call.
  const setupStarted = useRef(false);

  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;

    let cancelled = false;

    async function setup() {
      if (!stripePromise) {
        setError("Payments are not configured.");
        return;
      }
      try {
        // Get a SetupIntent from our API, then mount the Payment Element
        // bound to its client secret.
        const { client_secret } = await api.createSetupIntent();
        const stripe = await stripePromise;
        if (!stripe || cancelled) return;

        const elements = stripe.elements({ clientSecret: client_secret });
        const paymentElement = elements.create("payment");
        if (elementRef.current) paymentElement.mount(elementRef.current);

        stripeRef.current = stripe;
        elementsRef.current = elements;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setError(null);
    setSubmitting(true);

    // redirect: "if_required" keeps the customer here unless the bank's
    // 3-D Secure step needs a redirect. On success the webhook verifies
    // the card asynchronously.
    const { error: stripeError } = await stripeRef.current.confirmSetup({
      elements: elementsRef.current,
      confirmParams: {
        return_url: `${window.location.origin}/settings/payment`,
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "Could not add the card.");
      setSubmitting(false);
      return;
    }

    // Refresh the list; the new card shows as pending until the webhook
    // marks it verified.
    queryClient.invalidateQueries({ queryKey: keys.paymentMethods });
    onClose();
  };

  return (
    <Dialog
      title="Add a payment method"
      description="Validated with Stripe — no charge is made."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!ready || submitting}
            onClick={submit}
          >
            {submitting ? "Validating…" : "Add card"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Stripe mounts its iframe here. */}
        <div ref={elementRef} className="min-h-[120px]" />
        {!ready && !error && (
          <p className="text-muted-foreground text-xs">Loading secure form…</p>
        )}
        {error && <p className="text-destructive text-xs">{error}</p>}
      </div>
    </Dialog>
  );
}
