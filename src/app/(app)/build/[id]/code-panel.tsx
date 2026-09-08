"use client";

/**
 * The build session's IDE — file tree, tabbed editor, Save, version
 * history + rollback, ZIP download, and a Deploy (build image) button.
 * Fully editable per the explicit product decision: a customer can change
 * what the agent generated and save their own version, with rollback as
 * the safety net for a save (customer or agent) that breaks something.
 *
 * v1 scope, deliberately: editing EXISTING files' content. No create/
 * delete/rename from the tree — the agent is the one that shapes the
 * file set; the IDE is for correcting what's there, not restructuring
 * the project. That would be a reasonable follow-up, not a gap in this
 * pass's own ask.
 *
 * Data model: `workspace` is the last-saved version's content (polling
 * while the session is open, since the agent saves automatically after
 * every file_editor call). `edits` is a local, unsaved overlay on top of
 * it, keyed by path — Save sends the full file list (edits merged over
 * the loaded version) as a new version; nothing is a diff, matching how
 * SaveVersion itself always stores a complete snapshot per version (see
 * migration 025's own note on why: the same shape serves the file
 * browser AND the ZIP download with no second storage format).
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileImage,
  Folder,
  History,
  Loader2,
  Rocket,
  Save,
} from "lucide-react";

import ReactCodeMirror from "@uiw/react-codemirror";

import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { api } from "@/lib/api/client";
import { useActiveProject } from "@/lib/active-project";
import {
  errorMessage,
  useDeployKumbhaSession,
  useKumbhaWorkspace,
  useSaveKumbhaWorkspace,
} from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { consoleCodeMirrorTheme } from "./code-mirror-theme";
import { formatBytes } from "./format-bytes";
import {
  allDirPaths,
  buildFileTree,
  isImagePath,
  languageExtensionForPath,
  type FileTreeNode,
} from "./file-tree";
import { VersionHistoryDialog } from "./version-history-dialog";

export function CodePanel({
  sessionId,
  sessionStatus,
  deployApproved,
  onDeployed,
}: {
  sessionId: string;
  sessionStatus: string | undefined;
  deployApproved: boolean;
  /** Called with the deployed instance's live endpoint URL right after a
   *  successful deploy (first deploy or redeploy alike — a redeploy
   *  updates the same instance in place, so the URL is unchanged), so
   *  page.tsx can show it in the Preview tab without waiting for the
   *  agent's own event stream to mention it — this deploy never goes
   *  through the agent at all. */
  onDeployed: (endpoint: string) => void;
}) {
  const workspace = useKumbhaWorkspace(sessionId, sessionStatus);
  const save = useSaveKumbhaWorkspace(sessionId);
  const build = useDeployKumbhaSession(sessionId);
  const { project } = useActiveProject();
  // Only the FIRST deploy of a session creates a new instance and makes a
  // fresh home-placement decision — a redeploy of an already-deployed
  // session updates the same instance in place and is never blocked by
  // this toggle (see redeployKumbhaInstance's own existing.ProviderID
  // branch server-side). So this only warns/disables before that first
  // deploy, never on a redeploy.
  const onDemandDisabled =
    project?.allow_on_demand === false && !workspace.data?.is_deployed;

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const savedFiles = useMemo(() => workspace.data?.files ?? [], [workspace.data]);
  const savedByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of savedFiles) map.set(f.path, f.content);
    return map;
  }, [savedFiles]);

  const tree = useMemo(() => buildFileTree(savedFiles.map((f) => f.path)), [savedFiles]);

  // Expand every directory the first time a workspace loads. Adjusted
  // directly during render (React's supported pattern for "derive state
  // from a prop the first time it becomes available", using a second
  // piece of state as the one-shot guard rather than a ref — refs aren't
  // readable during render) instead of a useEffect, so there is no extra
  // commit-then-effect round trip — see
  // https://react.dev/learn/you-might-not-need-an-effect. After the first
  // trigger, `expanded` is entirely under the customer's own manual
  // collapse/expand control.
  const [expandedInitialized, setExpandedInitialized] = useState(false);
  if (!expandedInitialized && savedFiles.length > 0) {
    setExpandedInitialized(true);
    setExpanded(new Set(allDirPaths(tree)));
  }

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function openFile(path: string) {
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  }

  function closeTab(path: string) {
    setOpenPaths((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path) {
        setActivePath(next[next.length - 1] ?? null);
      }
      return next;
    });
  }

  const dirtyPaths = useMemo(
    () => new Set(Object.keys(edits).filter((p) => edits[p] !== savedByPath.get(p))),
    [edits, savedByPath],
  );
  const hasUnsavedChanges = dirtyPaths.size > 0;

  const activeContent = activePath
    ? (edits[activePath] ?? savedByPath.get(activePath) ?? "")
    : "";
  const activeLanguage = useMemo(
    () => (activePath ? languageExtensionForPath(activePath) : []),
    [activePath],
  );

  function handleSave() {
    const files = savedFiles.map((f) => ({
      path: f.path,
      content: edits[f.path] ?? f.content,
    }));
    save.mutate(
      { files, skipped: workspace.data?.skipped ?? [] },
      { onSuccess: () => setEdits({}) },
    );
  }

  if (workspace.isLoading) {
    return <Loading className="h-full" size={48} />;
  }

  if (workspace.isError || !workspace.data || savedFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-muted-foreground text-sm">
          {sessionStatus === "open"
            ? "Files will appear here as the agent writes them."
            : "No files were saved for this build."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="hairline-b border-border flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="text-muted-foreground truncate text-xs">
          v{workspace.data.version} · {savedFiles.length} files ·{" "}
          {formatBytes(workspace.data.byte_size)}
          {hasUnsavedChanges && (
            <span className="text-warning ml-1.5">· unsaved changes</span>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            title="Version history"
          >
            <History className="h-3.5 w-3.5" />
            History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void api.downloadKumbhaWorkspace(sessionId)}
            title="Download as ZIP"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasUnsavedChanges || save.isPending}
            onClick={handleSave}
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              !deployApproved ||
              build.isPending ||
              hasUnsavedChanges ||
              onDemandDisabled ||
              Boolean(workspace.data?.is_deployed)
            }
            title={
              hasUnsavedChanges
                ? "Save your changes first"
                : !deployApproved
                  ? "Approve the deployment plan in the activity feed first"
                  : onDemandDisabled
                    ? "On-demand capacity is turned off for this project — enable it in Project settings to deploy"
                    : workspace.data?.is_deployed
                      ? "Already deployed — nothing has changed since the last deploy"
                      : "Build the current version and deploy it as a running instance"
            }
            onClick={() =>
              build.mutate(undefined, {
                onSuccess: (result) => onDeployed(result.endpoint),
              })
            }
          >
            {build.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Deploy
          </Button>
        </div>
      </div>

      {onDemandDisabled && (
        <p className="text-warning border-border hairline-b px-3 py-1.5 text-xs">
          On-demand (home-node) capacity is turned off for this project,
          and no reserved capacity is available yet — deploying here will
          be refused. Enable on-demand capacity in Project settings to
          continue.
        </p>
      )}
      {save.isError && (
        <p className="text-destructive border-border hairline-b px-3 py-1.5 text-xs">
          Save failed: {errorMessage(save.error)}
        </p>
      )}
      {build.isError && (
        <p className="text-destructive border-border hairline-b px-3 py-1.5 text-xs">
          Deploy failed: {errorMessage(build.error)}
        </p>
      )}
      {build.isSuccess && (
        <p className="text-success border-border hairline-b px-3 py-1.5 text-xs">
          Deployed <span className="tabular">{build.data.instance_id}</span> —{" "}
          {build.data.endpoint}. Switch to Preview to view it. Redeploying
          again updates this same instance in place — the URL stays the
          same.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="hairline-r w-56 shrink-0 overflow-y-auto border-border py-1.5">
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded ?? new Set()}
              activePath={activePath}
              dirtyPaths={dirtyPaths}
              onToggleDir={toggleDir}
              onOpenFile={openFile}
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {openPaths.length > 0 && (
            <div className="hairline-b border-border flex shrink-0 overflow-x-auto">
              {openPaths.map((path) => (
                <button
                  key={path}
                  onClick={() => setActivePath(path)}
                  className={cn(
                    "hairline-r flex shrink-0 items-center gap-1.5 border-border px-3 py-1.5 text-xs",
                    path === activePath
                      ? "bg-background text-foreground"
                      : "bg-muted/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="max-w-40 truncate">{path.split("/").pop()}</span>
                  {dirtyPaths.has(path) && (
                    <span className="bg-warning h-1.5 w-1.5 shrink-0 rounded-full" />
                  )}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(path);
                    }}
                    className="text-muted-foreground hover:text-foreground -mr-1 ml-0.5"
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {!activePath ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-muted-foreground text-sm">
                  Select a file to view or edit it.
                </p>
              </div>
            ) : isImagePath(activePath) ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <FileImage className="text-muted-foreground h-8 w-8" />
                <p className="text-muted-foreground text-sm">
                  Binary files aren&apos;t previewed here — download the ZIP
                  to view {activePath.split("/").pop()}.
                </p>
              </div>
            ) : (
              <ReactCodeMirror
                value={activeContent}
                height="100%"
                theme="none"
                extensions={[...consoleCodeMirrorTheme, ...activeLanguage]}
                onChange={(value) =>
                  setEdits((prev) => ({ ...prev, [activePath]: value }))
                }
                basicSetup={{ foldGutter: true, highlightActiveLine: true }}
                style={{ height: "100%" }}
              />
            )}
          </div>
        </div>
      </div>

      {historyOpen && (
        <VersionHistoryDialog
          sessionId={sessionId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  activePath,
  dirtyPaths,
  onToggleDir,
  onOpenFile,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  dirtyPaths: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const isOpen = expanded.has(node.path);
  const style = { paddingLeft: `${depth * 0.875 + 0.5}rem` };

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => onToggleDir(node.path)}
          style={style}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex w-full items-center gap-1 py-1 pr-2 text-left text-xs"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              dirtyPaths={dirtyPaths}
              onToggleDir={onToggleDir}
              onOpenFile={onOpenFile}
            />
          ))}
      </div>
    );
  }

  const isActive = node.path === activePath;
  const isDirty = dirtyPaths.has(node.path);
  return (
    <button
      onClick={() => onOpenFile(node.path)}
      style={style}
      className={cn(
        "flex w-full items-center gap-1 py-1 pr-2 text-left text-xs",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <span className="h-3 w-3 shrink-0" />
      {isImagePath(node.path) ? (
        <FileImage className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <FileIcon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">{node.name}</span>
      {isDirty && <span className="bg-warning ml-auto h-1.5 w-1.5 shrink-0 rounded-full" />}
    </button>
  );
}
