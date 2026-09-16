"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/hooks";
import { formatBytes } from "@/lib/utils";

interface UploadState {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

/**
 * Drag-drop (or click-to-browse) upload — one PUT per file straight to
 * the backend, via api.storage.uploadObject's XMLHttpRequest (see its own
 * doc comment on why fetch() won't do: only XHR exposes upload progress,
 * and given the measured Shelby throughput a progress bar here is
 * load-bearing, not a nicety).
 *
 * Files upload SEQUENTIALLY, not in parallel: a backend's own
 * Capabilities().MaxConcurrentOps caps how many requests the server lets
 * in flight (6 for Shelby, from the confirmed eval) — firing many
 * parallel browser uploads would just queue behind that limit anyway,
 * while looking like independent failures if any got rejected under
 * load. There is no separate "finalizing" state to show: PutObject does
 * not return until the write has actually succeeded or failed for real
 * (see Service.PutObject's own doc comment), so "100%" here already
 * means it is actually available.
 */
export function UploadDropzone({
  bucket,
  prefix,
  onClose,
}: {
  bucket: string;
  prefix: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);

  const anyInFlight = uploads.some(
    (u) => u.status === "pending" || u.status === "uploading",
  );

  const runUploads = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setUploads((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status: "uploading" } : u)),
        );
        try {
          await api.storage.uploadObject(bucket, prefix + file.name, file, (percent) => {
            setUploads((prev) =>
              prev.map((u) => (u.file === file ? { ...u, progress: percent } : u)),
            );
          });
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: "done", progress: 100 } : u,
            ),
          );
          void queryClient.invalidateQueries({ queryKey: ["storage-objects", bucket] });
        } catch (err) {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: "error", error: errorMessage(err) } : u,
            ),
          );
        }
      }
    },
    [bucket, prefix, queryClient],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploads((prev) => [
        ...prev,
        ...list.map((file) => ({ file, progress: 0, status: "pending" as const })),
      ]);
      void runUploads(list);
    },
    [runUploads],
  );

  const openPicker = () => inputRef.current?.click();

  return (
    <Dialog
      title="Upload objects"
      description={prefix ? `Uploading into ${prefix}` : undefined}
      onClose={onClose}
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          {anyInFlight ? "Upload in background" : "Done"}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPicker();
            }
          }}
          role="button"
          tabIndex={0}
          className={`hairline flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-border border-dashed p-8 text-center transition-colors ${
            dragging ? "bg-muted" : ""
          }`}
        >
          <UploadCloud className="text-muted-foreground h-6 w-6" aria-hidden />
          <p className="text-foreground text-sm font-medium">
            Drag files here, or click to browse
          </p>
          <p className="text-muted-foreground text-xs">
            Large uploads may take a while depending on the storage backend.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        {uploads.length > 0 && (
          <div className="flex flex-col gap-2">
            {uploads.map((u, i) => (
              <div key={`${u.file.name}-${i}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate">{u.file.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {formatBytes(u.file.size)}
                    {u.status === "uploading" && ` · ${u.progress}%`}
                    {u.status === "done" && " · Done"}
                    {u.status === "error" && " · Failed"}
                  </span>
                </div>
                {u.status !== "error" ? (
                  <Progress value={u.status === "done" ? 100 : u.progress} />
                ) : (
                  <p className="text-destructive text-xs">{u.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
