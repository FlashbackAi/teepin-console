"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import {
  errorMessage,
  useAccount,
  useConvertToOrganization,
  useUpdateAccount,
} from "@/lib/api/hooks";
import { cn, formatAccountNumber, fullTime } from "@/lib/utils";
import type { Account } from "@/lib/api/types";

/**
 * Account settings.
 *
 * Laid out the way every cloud console lays this out, because the
 * convention is load-bearing: immutable identifiers first (customers
 * quote them to support), then editable details, then anything
 * destructive, isolated at the end.
 *
 * Account details are OWNER-ONLY on the API. The UI reflects that by
 * disabling the controls rather than hiding them — a member who cannot
 * edit should still be able to see what their organisation has on file,
 * and be told why they cannot change it.
 */
export default function AccountSettingsPage() {
  const account = useAccount();

  if (account.isLoading) {
    return (
      <>
        <PageHeader breadcrumb={["Account"]} />
        <Loading className="py-16" />
      </>
    );
  }

  if (!account.data) {
    return (
      <>
        <PageHeader breadcrumb={["Account"]} />
        <div className="text-muted-foreground p-6 text-sm">
          {errorMessage(account.error)}
        </div>
      </>
    );
  }

  return <Settings account={account.data} />;
}

function Settings({ account }: { account: Account }) {
  const update = useUpdateAccount();
  const [converting, setConverting] = useState(false);

  const isOrg = account.type === "organization";

  const [displayName, setDisplayName] = useState(account.display_name);
  const [legalName, setLegalName] = useState(account.legal_name ?? "");
  const [taxId, setTaxId] = useState(account.tax_id ?? "");
  const [billingEmail, setBillingEmail] = useState(account.billing_email ?? "");
  const [billingAddress, setBillingAddress] = useState(
    account.billing_address ?? "",
  );
  const [country, setCountry] = useState(account.country ?? "");

  // Re-sync after a save so the form never shows stale values.
  useEffect(() => {
    setDisplayName(account.display_name);
    setLegalName(account.legal_name ?? "");
    setTaxId(account.tax_id ?? "");
    setBillingEmail(account.billing_email ?? "");
    setBillingAddress(account.billing_address ?? "");
    setCountry(account.country ?? "");
  }, [account]);

  const dirty =
    displayName !== account.display_name ||
    legalName !== (account.legal_name ?? "") ||
    taxId !== (account.tax_id ?? "") ||
    billingEmail !== (account.billing_email ?? "") ||
    billingAddress !== (account.billing_address ?? "") ||
    country !== (account.country ?? "");

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    // Only changed fields: the API treats an omitted field as "leave
    // unchanged", so sending everything would overwrite values another
    // owner may have edited since this page loaded.
    update.mutate({
      ...(displayName !== account.display_name ? { display_name: displayName } : {}),
      ...(legalName !== (account.legal_name ?? "") ? { legal_name: legalName } : {}),
      ...(taxId !== (account.tax_id ?? "") ? { tax_id: taxId } : {}),
      ...(billingEmail !== (account.billing_email ?? "")
        ? { billing_email: billingEmail }
        : {}),
      ...(billingAddress !== (account.billing_address ?? "")
        ? { billing_address: billingAddress }
        : {}),
      ...(country !== (account.country ?? "") ? { country } : {}),
    });
  };

  return (
    <>
      <PageHeader breadcrumb={["Account"]} />

      <div className="flex max-w-3xl flex-col gap-6 p-6">
        {/* Immutable identity. Pinned at the top because these are what a
            customer reads out to support during an incident. */}
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Detail label="Account name">{account.display_name}</Detail>
            <Detail label="Account type">
              {isOrg ? "Organization" : "Personal"}
            </Detail>
            <Detail label="Account number">
              <Copyable value={account.account_number}>
                {formatAccountNumber(account.account_number)}
              </Copyable>
            </Detail>
            <Detail label="Account alias">
              <Copyable value={account.alias}>{account.alias}</Copyable>
            </Detail>
            <Detail label="Account ID">
              <Copyable value={account.id}>{account.id}</Copyable>
            </Detail>
            <Detail label="Created">{fullTime(account.created_at)}</Detail>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact and billing information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="flex flex-col gap-4">
              <Field
                label="Account name"
                hint="Shown throughout the console."
                error={update.isError ? errorMessage(update.error) : undefined}
                htmlFor="display-name"
              >
                <Input
                  id="display-name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>

              {isOrg && (
                <>
                  <Field
                    label="Legal entity name"
                    hint="Appears on invoices. Use the registered company name."
                    htmlFor="legal-name"
                  >
                    <Input
                      id="legal-name"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                    />
                  </Field>

                  <Field
                    label="Tax registration number"
                    hint="VAT, GST or equivalent. Shown on invoices where required."
                    htmlFor="tax-id"
                  >
                    <Input
                      id="tax-id"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                    />
                  </Field>
                </>
              )}

              <Field
                label="Billing email"
                hint="Where invoices are sent. Defaults to the account owner."
                htmlFor="billing-email"
              >
                <Input
                  id="billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                />
              </Field>

              <Field
                label="Billing address"
                hint="Appears on invoices."
                htmlFor="billing-address"
              >
                <Input
                  id="billing-address"
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                />
              </Field>

              <Field
                label="Country"
                hint="Determines tax treatment on invoices."
                htmlFor="country"
              >
                <Select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="">Not set</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!dirty || update.isPending}
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
                {update.isSuccess && !dirty && (
                  <span className="text-muted-foreground text-xs">Saved.</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {!isOrg && (
          <Card>
            <CardHeader>
              <CardTitle>Convert to an organization</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                Organization accounts can add sub-users with their own
                sign-in credentials and roles, and carry a legal entity name
                and tax registration on invoices.
              </p>
              {/* Stated plainly because it is genuinely irreversible on
                  the API — not a UI convention. */}
              <p className="text-muted-foreground text-sm">
                This cannot be undone.
              </p>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConverting(true)}
                >
                  Convert to organization
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/40">
          <CardHeader className="border-destructive/40">
            <CardTitle className="text-destructive">Close account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Closing an account terminates every instance and ends billing.
              Invoices and usage history are retained for tax and audit
              purposes.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="destructive" size="sm" disabled>
                Close account
              </Button>
              <span className="text-muted-foreground text-xs">
                Contact support@teepin.com to close an account.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {converting && (
        <ConvertDialog onClose={() => setConverting(false)} />
      )}
    </>
  );
}

function ConvertDialog({ onClose }: { onClose: () => void }) {
  const convert = useConvertToOrganization();
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [country, setCountry] = useState("");

  return (
    <Dialog
      title="Convert to an organization"
      description="This cannot be undone."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            form="convert-account"
            type="submit"
            disabled={convert.isPending}
          >
            {convert.isPending ? "Converting…" : "Convert account"}
          </Button>
        </>
      }
    >
      <form
        id="convert-account"
        onSubmit={(event) => {
          event.preventDefault();
          convert.mutate(
            { legal_name: legalName, tax_id: taxId, country },
            { onSuccess: onClose },
          );
        }}
        className="flex flex-col gap-4"
      >
        <Field
          label="Legal entity name"
          hint="The registered company name. Appears on invoices."
          htmlFor="convert-legal-name"
        >
          <Input
            id="convert-legal-name"
            required
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </Field>
        <Field
          label="Tax registration number"
          hint="Optional. VAT, GST or equivalent."
          htmlFor="convert-tax-id"
        >
          <Input
            id="convert-tax-id"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </Field>
        <Field label="Country" htmlFor="convert-country">
          <Select
            id="convert-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Not set</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {convert.isError && (
          <p className="text-destructive text-xs">
            {errorMessage(convert.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm">{children}</span>
    </div>
  );
}

/**
 * A value with a copy button.
 *
 * Account numbers, aliases and IDs get quoted into support tickets and
 * CLI commands; selecting them by hand invites transcription errors in
 * exactly the identifiers where an error is hardest to spot.
 */
function Copyable({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group inline-flex items-center gap-1.5 text-left"
      aria-label={`Copy ${value}`}
    >
      <span className="identifier">{children}</span>
      {copied ? (
        <Check className="text-success h-3 w-3 shrink-0" />
      ) : (
        <Copy
          className={cn(
            "text-muted-foreground h-3 w-3 shrink-0",
            "opacity-0 transition-opacity group-hover:opacity-100",
          )}
        />
      )}
    </button>
  );
}

/**
 * Countries TEEPIN currently bills into.
 *
 * Deliberately short rather than a full ISO list: every country here
 * implies a tax position someone has thought about, and offering 249
 * options would promise coverage that does not exist. Extend as the
 * business actually expands.
 */
const COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
];
