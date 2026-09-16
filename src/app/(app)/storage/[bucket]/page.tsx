"use client";

import { use, useState } from "react";
import { Folder } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import {
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shell/page-header";
import { useActiveProject } from "@/lib/active-project";
import {
  errorMessage,
  useCreateFolder,
  useDeleteFolder,
  useDeleteObject,
  useDeleteObjects,
  useObjects,
} from "@/lib/api/hooks";
import { formatBytes, fullTime, timeAgo } from "@/lib/utils";
import type { StorageObject, StorageObjectStatus } from "@/lib/api/types";
import { ObjectDetailsDrawer } from "./object-details-drawer";
import { UploadDropzone } from "./upload-dropzone";

/**
 * Object browser for one bucket.
 *
 * "Folders" are not a server concept — the catalog stores flat keys, and
 * the backend's own list endpoint is a plain prefix filter, not a
 * delimited listing. Every key matching the current prefix is fetched in
 * one page, then split HERE into synthetic folder rows (any key with a
 * further "/" past the prefix) and file rows (keys with none) — exactly
 * the client-side derivation the plan called for.
 */

interface Row {
  type: "folder" | "object";
  name: string;
  object?: StorageObject;
}

function splitIntoRows(objects: StorageObject[], prefix: string): Row[] {
  const folderNames = new Set<string>();
  const fileRows: Row[] = [];

  for (const obj of objects) {
    const remainder = obj.key.slice(prefix.length);
    // The zero-byte placeholder that makes an empty folder exist has a
    // key EQUAL to its own prefix — once you navigate inside that
    // folder, its own listing includes that same placeholder, and an
    // empty remainder was being rendered as a real file row with a
    // blank name. It's purely a marker; never a row to show.
    if (remainder === "") continue;
    const slash = remainder.indexOf("/");
    if (slash === -1) {
      fileRows.push({ type: "object", name: remainder, object: obj });
    } else {
      folderNames.add(remainder.slice(0, slash));
    }
  }

  const folderRows: Row[] = Array.from(folderNames)
    .sort()
    .map((name) => ({ type: "folder", name }));
  fileRows.sort((a, b) => a.name.localeCompare(b.name));
  return [...folderRows, ...fileRows];
}

const STATUS_STYLES: Record<StorageObjectStatus, { dot: string; label: string }> = {
  available: { dot: "bg-success", label: "Available" },
  failed: { dot: "bg-destructive", label: "Failed" },
  deleted: { dot: "bg-muted-foreground/50", label: "Deleted" },
  missing: { dot: "bg-destructive", label: "Missing" },
  orphaned: { dot: "bg-warning", label: "Orphaned" },
};

function ObjectStatusLabel({ object }: { object: StorageObject }) {
  const style = STATUS_STYLES[object.status] ?? STATUS_STYLES.available;
  return (
    <span className="inline-flex items-center gap-1.5" title={object.upload_error}>
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
        aria-hidden
      />
      <span className="text-foreground">{style.label}</span>
    </span>
  );
}

export default function BucketPage({
  params,
}: {
  params: Promise<{ bucket: string }>;
}) {
  const { bucket: bucketParam } = use(params);
  const bucketName = decodeURIComponent(bucketParam);
  const { project } = useActiveProject();
  const ready = Boolean(project);

  const [prefix, setPrefix] = useState("");
  const objects = useObjects(bucketName, prefix, ready);
  const deleteOne = useDeleteObject(bucketName);
  const deleteMany = useDeleteObjects(bucketName);
  const createFolder = useCreateFolder(bucketName);
  const deleteFolder = useDeleteFolder(bucketName);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

  const rows = splitIntoRows(objects.data?.objects ?? [], prefix);
  const fileKeys = rows
    .filter((r) => r.type === "object")
    .map((r) => r.object!.key);
  const selectedKeys = fileKeys.filter((key) => selected.has(key));
  const allSelected = fileKeys.length > 0 && selectedKeys.length === fileKeys.length;
  const someSelected = selectedKeys.length > 0 && !allSelected;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(fileKeys));

  const breadcrumbSegments = prefix ? prefix.replace(/\/$/, "").split("/") : [];

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Projects", href: "/projects" },
          project ? { label: project.name, href: "/home" } : "…",
          { label: "Storage", href: "/storage" },
          bucketName,
        ]}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreatingFolder(true)}
              disabled={!ready}
            >
              New folder
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setUploading(true)}
              disabled={!ready}
            >
              Upload
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 p-6">
        <nav className="text-muted-foreground text-sm">
          <button
            className="hover:text-foreground hover:underline"
            onClick={() => setPrefix("")}
          >
            {bucketName}
          </button>
          {breadcrumbSegments.map((segment, i) => {
            const segmentPrefix = breadcrumbSegments.slice(0, i + 1).join("/") + "/";
            const isLast = i === breadcrumbSegments.length - 1;
            return (
              <span key={segmentPrefix}>
                <span className="text-muted-foreground/50 mx-1.5">/</span>
                <button
                  className={
                    isLast ? "text-foreground" : "hover:text-foreground hover:underline"
                  }
                  onClick={() => setPrefix(segmentPrefix)}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </nav>

        {selectedKeys.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {selectedKeys.length} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleting(true)}
            >
              Delete {selectedKeys.length} selected
            </Button>
          </div>
        )}

        <Card>
          {objects.isLoading || !ready ? (
            <Loading className="px-4 py-16" />
          ) : objects.isError ? (
            <EmptyState
              title="Cannot reach this bucket"
              description={errorMessage(objects.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => objects.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={prefix ? "This folder is empty" : "No objects yet"}
              description="Upload a file to get started."
              action={
                <Button variant="primary" size="sm" onClick={() => setUploading(true)}>
                  Upload
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-9 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Select all objects"
                      className="accent-foreground align-middle"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      disabled={fileKeys.length === 0}
                    />
                  </TH>
                  <TH>Name</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Size</TH>
                  <TH>Uploaded</TH>
                  <TH className="w-16" />
                </TR>
              </THead>
              <TBody>
                {rows.map((row) =>
                  row.type === "folder" ? (
                    <TR key={`folder-${row.name}`}>
                      <TD className="w-9 pr-0" />
                      <TD colSpan={4}>
                        <button
                          className="text-foreground inline-flex items-center gap-1.5 font-medium hover:underline"
                          onClick={() => setPrefix(prefix + row.name + "/")}
                        >
                          <Folder className="h-3.5 w-3.5" aria-hidden />
                          {row.name}/
                        </button>
                      </TD>
                      <TD className="w-16 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingFolder(row.name)}
                        >
                          Delete
                        </Button>
                      </TD>
                    </TR>
                  ) : (
                    <TR
                      key={row.object!.key}
                      className={selected.has(row.object!.key) ? "bg-muted/50" : undefined}
                    >
                      <TD className="w-9 pr-0">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          className="accent-foreground align-middle"
                          checked={selected.has(row.object!.key)}
                          onChange={() => toggle(row.object!.key)}
                        />
                      </TD>
                      <TD>
                        <button
                          className="text-foreground font-medium hover:underline"
                          onClick={() => setViewingKey(row.object!.key)}
                        >
                          {row.name}
                        </button>
                      </TD>
                      <TD>
                        <ObjectStatusLabel object={row.object!} />
                      </TD>
                      <TD className="tabular text-right">
                        {formatBytes(row.object!.size_bytes)}
                      </TD>
                      <TD
                        className="text-muted-foreground"
                        title={
                          row.object!.uploaded_at
                            ? fullTime(row.object!.uploaded_at)
                            : undefined
                        }
                      >
                        {row.object!.uploaded_at ? timeAgo(row.object!.uploaded_at) : "—"}
                      </TD>
                      <TD className="w-16 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingKey(row.object!.key)}
                        >
                          Delete
                        </Button>
                      </TD>
                    </TR>
                  ),
                )}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      {creatingFolder && (
        <Dialog
          title="New folder"
          description={
            prefix ? `Creating inside ${prefix}` : "Creating at the bucket root"
          }
          onClose={() => {
            setCreatingFolder(false);
            setFolderName("");
            createFolder.reset();
          }}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreatingFolder(false);
                  setFolderName("");
                  createFolder.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={
                  createFolder.isPending ||
                  !folderName.trim() ||
                  folderName.includes("/")
                }
                onClick={() =>
                  createFolder.mutate(`${prefix}${folderName.trim()}/`, {
                    onSuccess: () => {
                      setCreatingFolder(false);
                      setFolderName("");
                    },
                  })
                }
              >
                {createFolder.isPending ? "Creating…" : "Create folder"}
              </Button>
            </>
          }
        >
          <Field label="Folder name" htmlFor="folder-name">
            <Input
              id="folder-name"
              autoFocus
              placeholder="documents"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </Field>
          {folderName.includes("/") && (
            <p className="text-destructive mt-2 text-xs">
              A folder name can&apos;t contain &quot;/&quot; — navigate into the
              folder first to create one inside it.
            </p>
          )}
          {createFolder.isError && (
            <p className="text-destructive mt-2 text-xs">
              {errorMessage(createFolder.error)}
            </p>
          )}
        </Dialog>
      )}

      {uploading && (
        <UploadDropzone
          bucket={bucketName}
          prefix={prefix}
          onClose={() => setUploading(false)}
        />
      )}

      {viewingKey && (
        <ObjectDetailsDrawer
          bucket={bucketName}
          objectKey={viewingKey}
          onClose={() => setViewingKey(null)}
        />
      )}

      {deletingKey && (
        <Dialog
          title="Delete object"
          description="This cannot be undone."
          onClose={() => setDeletingKey(null)}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setDeletingKey(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteOne.isPending}
                onClick={() =>
                  deleteOne.mutate(deletingKey, {
                    onSuccess: () => setDeletingKey(null),
                  })
                }
              >
                {deleteOne.isPending ? "Deleting…" : "Delete"}
              </Button>
            </>
          }
        >
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground">{deletingKey}</span> will be
            permanently deleted.
          </p>
          {deleteOne.isError && (
            <p className="text-destructive mt-3 text-xs">
              {errorMessage(deleteOne.error)}
            </p>
          )}
        </Dialog>
      )}

      {deletingFolder && (
        <Dialog
          title="Delete folder"
          description="This permanently deletes everything inside it — not just the folder itself."
          onClose={() => {
            setDeletingFolder(null);
            deleteFolder.reset();
          }}
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeletingFolder(null);
                  deleteFolder.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteFolder.isPending}
                onClick={() =>
                  deleteFolder.mutate(`${prefix}${deletingFolder}/`, {
                    onSuccess: () => setDeletingFolder(null),
                  })
                }
              >
                {deleteFolder.isPending ? "Deleting…" : "Delete folder"}
              </Button>
            </>
          }
        >
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground">
              {prefix}
              {deletingFolder}/
            </span>{" "}
            and every object inside it will be permanently deleted.
          </p>
          {deleteFolder.isError && (
            <p className="text-destructive mt-3 text-xs">
              {errorMessage(deleteFolder.error)}
            </p>
          )}
        </Dialog>
      )}

      {bulkDeleting && (
        <Dialog
          title={`Delete ${selectedKeys.length} objects`}
          description="This cannot be undone."
          onClose={() => setBulkDeleting(false)}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setBulkDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMany.isPending}
                onClick={() =>
                  deleteMany.mutate(selectedKeys, {
                    onSuccess: (deleted) => {
                      setBulkDeleting(false);
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const key of deleted) next.delete(key);
                        return next;
                      });
                    },
                  })
                }
              >
                {deleteMany.isPending ? "Deleting…" : `Delete ${selectedKeys.length} objects`}
              </Button>
            </>
          }
        >
          <p className="text-muted-foreground text-sm">
            {selectedKeys.length} objects will be permanently deleted.
          </p>
          {deleteMany.isError && (
            <p className="text-destructive mt-3 text-xs">
              {errorMessage(deleteMany.error)}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
