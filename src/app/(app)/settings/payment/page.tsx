"use client";

import { useState } from "react";
import { PaymentIcon, type PaymentType } from "react-svg-credit-card-payment-icons";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import {
  errorMessage,
  usePaymentMethods,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
} from "@/lib/api/hooks";
import type { PaymentMethod } from "@/lib/api/types";
import { AddCardDialog } from "./add-card-dialog";

/**
 * Payment methods.
 *
 * A card belongs to the ACCOUNT (the billing entity), and a validated
 * card is what unlocks launching resources. The account must never be
 * left without a means of payment: the last verified card cannot be
 * removed (the API returns 409), reflected here by disabling that card's
 * Remove button.
 *
 * Laid out AWS-style: a compact default-card summary at the top, then the
 * cards as rows with the real brand mark, so a customer recognises which
 * card is on file at a glance.
 */
export default function PaymentSettingsPage() {
  const [adding, setAdding] = useState(false);
  const methods = usePaymentMethods();

  const cards = methods.data?.payment_methods ?? [];
  const verifiedCount = cards.filter((c) => c.status === "verified").length;
  const defaultCard = cards.find((c) => c.is_default && c.status === "verified");

  return (
    <>
      <PageHeader
        breadcrumb={["Billing & Cost Management", "Payments"]}
        action={
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            Add card
          </Button>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        {/* Default payment preference — the one card that gets charged. */}
        {defaultCard && (
          <Card>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">
                  Default payment method
                </span>
                <CardIdentity card={defaultCard} />
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              Payment methods
              {cards.length > 0 && (
                <span className="text-muted-foreground ml-2 font-normal">
                  ({cards.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>

          {methods.isLoading ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              Loading…
            </div>
          ) : methods.isError ? (
            <EmptyState
              title="Could not load payment methods"
              description={errorMessage(methods.error)}
            />
          ) : cards.length === 0 ? (
            <EmptyState
              title="No payment method"
              description="Add a card to launch instances. It is validated with Stripe — no charge is made."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setAdding(true)}
                >
                  Add card
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <PaymentMethodTile
                  key={card.id}
                  card={card}
                  isOnlyVerified={
                    card.status === "verified" && verifiedCount <= 1
                  }
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {adding && <AddCardDialog onClose={() => setAdding(false)} />}
    </>
  );
}

/**
 * One card, as a self-contained tile (AWS-style): brand mark + masked
 * number up top, expiry and badges in the middle, actions along the
 * bottom. The default card's tile gets a highlighted ring so it stands
 * out in the grid.
 */
function PaymentMethodTile({
  card,
  isOnlyVerified,
}: {
  card: PaymentMethod;
  isOnlyVerified: boolean;
}) {
  const remove = useRemovePaymentMethod();
  const setDefault = useSetDefaultPaymentMethod();
  const pending = card.status !== "verified";

  return (
    <div
      className={[
        "hairline flex flex-col justify-between gap-3 rounded-lg border-border p-3",
        card.is_default ? "ring-1 ring-border bg-muted/30" : "",
      ].join(" ")}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <PaymentIcon
            type={brandToIcon(card.brand)}
            format="flatRounded"
            width={44}
          />
          {card.is_default && !pending && (
            <span className="hairline rounded border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Default
            </span>
          )}
          {pending && <PendingTag status={card.status} />}
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="identifier text-foreground text-sm">
            •••• •••• •••• {card.last4 ?? "••••"}
          </span>
          {card.exp_month && card.exp_year && (
            <span className="text-muted-foreground text-xs">
              Expires {String(card.exp_month).padStart(2, "0")}/{card.exp_year}
            </span>
          )}
          {/* Fallback label only when the logo says nothing — a pending
              card has no brand yet, so the Generic mark needs a word. */}
          {!card.brand && (
            <span className="text-muted-foreground text-xs">Card</span>
          )}
        </div>
      </div>

      <div className="hairline-t flex items-center justify-end gap-1 border-border pt-2">
        {card.status === "verified" && !card.is_default && (
          <Button
            variant="ghost"
            size="sm"
            disabled={setDefault.isPending}
            onClick={() => setDefault.mutate(card.id)}
          >
            Make default
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending || isOnlyVerified}
          title={
            isOnlyVerified
              ? "Add another card before removing this one"
              : undefined
          }
          onClick={() => remove.mutate(card.id)}
        >
          {remove.isPending ? "Removing…" : "Remove"}
        </Button>
      </div>
    </div>
  );
}

/** Compact brand + masked number + expiry, for the default-card summary
 *  line at the top. No redundant brand text — the logo carries it. */
function CardIdentity({ card }: { card: PaymentMethod }) {
  return (
    <div className="flex items-center gap-3">
      <PaymentIcon
        type={brandToIcon(card.brand)}
        format="flatRounded"
        width={38}
      />
      <div className="flex items-baseline gap-2">
        <span className="identifier text-foreground text-sm">
          •••• {card.last4 ?? "••••"}
        </span>
        {card.exp_month && card.exp_year && (
          <span className="text-muted-foreground text-xs">
            exp {String(card.exp_month).padStart(2, "0")}/{card.exp_year}
          </span>
        )}
      </div>
    </div>
  );
}

function PendingTag({ status }: { status: PaymentMethod["status"] }) {
  const label =
    status === "pending"
      ? "Validating…"
      : status === "failed"
        ? "Validation failed"
        : status;
  return <span className="text-muted-foreground text-xs">{label}</span>;
}

/**
 * Map Stripe's lowercase brand string to a react-svg-credit-card icon
 * type. Stripe returns: visa, mastercard, amex, discover, diners, jcb,
 * unionpay (and "unknown"). Anything unrecognised — including a pending
 * card with no brand yet — falls back to the Generic card mark.
 */
function brandToIcon(brand?: string): PaymentType {
  switch ((brand ?? "").toLowerCase()) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
    case "american express":
      return "Amex";
    case "discover":
      return "Discover";
    case "diners":
    case "diners club":
      return "Diners";
    case "jcb":
      return "JCB";
    case "unionpay":
      return "UnionPay";
    default:
      return "Generic";
  }
}
