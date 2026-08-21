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

  // The pending payment-method row createSetupIntent() creates BEFORE any
  // card is entered — Stripe requires the SetupIntent to exist before the
  // Payment Element can render. Tracked so this dialog can remove it if
  // the customer never completes the flow (closes the dialog by any
  // means, or Stripe.js itself fails to load) — cleared to null once the
  // card is actually submitted, so a successful add is never removed.
  // Found live 2026-08-21: without this, an abandoned or failed attempt
  // left a permanent "Validating…" card nothing could ever remove.
  const pendingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;

    // No `cancelled`-on-cleanup guard here, deliberately: React 18's
    // StrictMode dev double-invoke (mount → cleanup → mount again) would
    // fire that cleanup for THIS run immediately, before any await below
    // resolves — so by the time setup() reached its own `if (cancelled)
    // return`, it would exit having never called setReady() or setError()
    // for ANY outcome. The second (kept) invocation never starts its own
    // work either, since setupStarted.current is already true by then. Net
    // effect: permanently stuck on "Loading secure form…" with no error,
    // in dev only — found live 2026-08-21 chasing exactly that symptom
    // through several other candidate causes first. Safe to omit: React 18
    // already no-ops a setState call on a truly-unmounted component, so
    // there is no real unmounted-update risk being traded away here.
    async function setup() {
      if (!stripePromise) {
        setError("Payments are not configured.");
        return;
      }
      try {
        // Get a SetupIntent from our API, then mount the Payment Element
        // bound to its client secret.
        const { client_secret, payment_method_id } =
          await api.createSetupIntent();
        pendingIdRef.current = payment_method_id;

        // loadStripe() has two distinct failure shapes, both found live
        // (2026-08-21): it can resolve to null (a load error stripe-js
        // itself detected), or — when a blocker drops the request to
        // js.stripe.com without ever firing the script's load or error
        // event — it can hang and never settle at all. Racing it against
        // a timeout turns the second case into the first, so both end up
        // in the one `!stripe` branch below instead of leaving the dialog
        // stuck on "Loading secure form…" forever with no explanation.
        const stripe = await Promise.race([
          stripePromise,
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10_000),
          ),
        ]);
        if (!stripe) {
          setError(
            "Could not load the secure payment form. Check your network connection (an ad blocker or firewall may be blocking Stripe) and try again.",
          );
          return;
        }

        const elements = stripe.elements({ clientSecret: client_secret });
        const paymentElement = elements.create("payment");
        if (elementRef.current) paymentElement.mount(elementRef.current);

        stripeRef.current = stripe;
        elementsRef.current = elements;
        setReady(true);
      } catch (e) {
        setError(errorMessage(e));
      }
    }

    setup();
  }, []);

  // Fires on every way this dialog can be dismissed without completing —
  // Cancel, the X button, Escape, and clicking the backdrop all route
  // through Dialog's single onClose prop (see dialog.tsx), so wrapping it
  // once here covers all of them. Best-effort and fire-and-forget: if the
  // cleanup call itself fails, the customer still sees the dialog close,
  // and the row is harmless leftover state rather than something visibly
  // broken — better than blocking the close on a network call.
  const handleClose = () => {
    if (pendingIdRef.current) {
      const id = pendingIdRef.current;
      pendingIdRef.current = null;
      api.removePaymentMethod(id).catch(() => {
        // Best-effort — see comment above.
      });
    }
    onClose();
  };

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

    // A real submission was made — this row is no longer "abandoned",
    // so handleClose must never remove it after this point.
    pendingIdRef.current = null;

    // Refresh the list; the new card shows as pending until the webhook
    // marks it verified.
    queryClient.invalidateQueries({ queryKey: keys.paymentMethods });
    onClose();
  };

  return (
    <Dialog
      title="Add a payment method"
      description="Validated with Stripe — no charge is made."
      onClose={handleClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={handleClose}>
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
