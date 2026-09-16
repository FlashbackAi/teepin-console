"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Loading } from "@/components/ui/loading";
import { api } from "@/lib/api/client";
import { errorMessage, useObject } from "@/lib/api/hooks";
import { formatBytes, fullTime, triggerDownload } from "@/lib/utils";

/**
 * Full metadata for one object, plus Preview/Download actions.
 *
 * Both go through a freshly-minted signed link (pkg/objectstore's own
 * stand-in for a presigned URL, since Shelby rejects presigned URLs
 * outright) rather than an authed fetch — the resulting URL needs no
 * Authorization header at all. They differ only in the disposition baked
 * into the token (see api.storage.mintDownloadUrl's own comment on why
 * that has to be chosen at mint time, not as an editable query param):
 * Preview opens the link in a NEW tab so the console's own state isn't
 * lost navigating to a raw video/image URL; Download uses the existing
 * same-page triggerDownload, which is safe here specifically because an
 * "attachment" Content-Disposition makes the browser show a save dialog
 * rather than actually navigate away.
 */
export function ObjectDetailsDrawer({
  bucket,
  objectKey,
  onClose,
}: {
  bucket: string;
  objectKey: string;
  onClose: () => void;
}) {
  const object = useObject(bucket, objectKey);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const preview = async () => {
    setPreviewing(true);
    setActionError(null);
    try {
      const { url } = await api.storage.mintDownloadUrl(bucket, objectKey, "inline");
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPreviewing(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    setActionError(null);
    try {
      const { url } = await api.storage.mintDownloadUrl(bucket, objectKey, "attachment");
      triggerDownload(url);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog title={objectKey.split("/").pop() || objectKey} onClose={onClose}>
      {object.isLoading ? (
        <Loading className="py-8" />
      ) : object.isError ? (
        <p className="text-destructive text-sm">{errorMessage(object.error)}</p>
      ) : (
        object.data && (
          <div className="flex flex-col gap-3 text-sm">
            <Row label="Key" value={object.data.key} mono />
            <Row label="Size" value={formatBytes(object.data.size_bytes)} />
            <Row label="Content-Type" value={object.data.content_type || "—"} />
            <Row label="Status" value={object.data.status} />
            <Row label="Backend" value={object.data.backend} />
            <Row
              label="Checksum (SHA-256)"
              value={object.data.checksum_sha256 || "—"}
              mono
            />
            <Row
              label="Uploaded"
              value={
                object.data.uploaded_at ? fullTime(object.data.uploaded_at) : "—"
              }
            />
            {object.data.upload_error && (
              <Row label="Upload error" value={object.data.upload_error} error />
            )}
            {object.data.metadata &&
              Object.keys(object.data.metadata).length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">
                    Custom metadata
                  </span>
                  <div className="hairline border-border rounded-md p-2">
                    {Object.entries(object.data.metadata).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="text-foreground truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="hairline-t border-border mt-2 flex flex-col gap-2 pt-3">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={preview}
                  disabled={previewing || object.data.status !== "available"}
                >
                  {previewing ? "Preparing link…" : "Preview"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={download}
                  disabled={downloading || object.data.status !== "available"}
                >
                  {downloading ? "Preparing link…" : "Download"}
                </Button>
              </div>
              {actionError && (
                <p className="text-destructive text-xs">{actionError}</p>
              )}
            </div>
          </div>
        )
      )}
    </Dialog>
  );
}

function Row({
  label,
  value,
  mono,
  error,
}: {
  label: string;
  value: string;
  mono?: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={
          error
            ? "text-destructive text-sm"
            : mono
              ? "identifier text-foreground text-xs break-all"
              : "text-foreground text-sm"
        }
      >
        {value}
      </span>
    </div>
  );
}
