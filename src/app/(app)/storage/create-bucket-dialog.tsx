"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { errorMessage, useCreateBucket } from "@/lib/api/hooks";

/**
 * Create a Teepin S3 bucket.
 *
 * Backend validation (storage.ValidBucketName) enforces the actual naming
 * rule server-side — this dialog surfaces whatever it rejects via
 * errorMessage rather than duplicating the regex client-side, so the two
 * can never drift out of sync.
 */
export function CreateBucketDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateBucket();
  const [name, setName] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    create.mutate(name.trim(), {
      onSuccess: (bucket) => {
        onClose();
        router.push(`/storage/${encodeURIComponent(bucket.name)}`);
      },
    });
  };

  return (
    <Dialog
      title="Create bucket"
      description="A namespace for your objects. The storage backend is fixed for the whole platform — a bucket never needs to specify one."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            form="create-bucket"
            type="submit"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending ? "Creating…" : "Create bucket"}
          </Button>
        </>
      }
    >
      <form id="create-bucket" onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Name"
          hint="Lowercase letters, numbers, dots and hyphens, 3-63 characters."
          htmlFor="bucket-name"
        >
          <Input
            id="bucket-name"
            required
            autoFocus
            pattern="[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"
            placeholder="photos"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        {create.isError && (
          <p className="text-destructive text-xs">{errorMessage(create.error)}</p>
        )}
      </form>
    </Dialog>
  );
}
