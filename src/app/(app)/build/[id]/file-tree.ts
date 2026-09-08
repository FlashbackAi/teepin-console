/** Pure helpers for the IDE's file tree — no React, easy to unit-test in
 *  isolation from CodeMirror/rendering. */

import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

export interface FileTreeNode {
  name: string;
  /** Full workspace-relative path — "" for the synthetic root. */
  path: string;
  type: "file" | "dir";
  children: FileTreeNode[];
}

/** Builds a nested tree from a flat list of workspace-relative paths
 *  (already forward-slashed and sanitized server-side — see
 *  pkg/kumbha/workspace.go's sanitizeWorkspacePath). Directories are
 *  synthesized from path segments; there is no separate "directory"
 *  entry in the stored file list. Sorted directories-first, then
 *  alphabetically, at every level — the conventional file-explorer order. */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", type: "dir", children: [] };

  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    let node = root;
    let soFar = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      soFar = soFar ? `${soFar}/${segment}` : segment;
      const isLeaf = i === segments.length - 1;
      let child = node.children.find((c) => c.name === segment);
      if (!child) {
        child = { name: segment, path: soFar, type: isLeaf ? "file" : "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }

  sortTree(root);
  return root.children;
}

function sortTree(node: FileTreeNode) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTree(child);
}

/** Every directory path in a tree, used to default the file tree to
 *  fully expanded — a freshly generated web app is small enough that
 *  collapsing anything by default just costs an extra click. */
export function allDirPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (list: FileTreeNode[]) => {
    for (const node of list) {
      if (node.type === "dir") {
        paths.push(node.path);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

const EXTENSION_LANGUAGE: Record<string, () => Extension> = {
  html: html,
  htm: html,
  css: css,
  json: json,
  md: markdown,
  markdown: markdown,
  js: () => javascript({ jsx: false }),
  mjs: () => javascript({ jsx: false }),
  cjs: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ jsx: false, typescript: true }),
  tsx: () => javascript({ jsx: true, typescript: true }),
};

/** CodeMirror language extension for a file, by extension — an empty
 *  array (plain text, no highlighting) for anything unrecognised rather
 *  than guessing, since a wrong grammar reads worse than none. */
export function languageExtensionForPath(path: string): Extension[] {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return [];
  const ext = path.slice(dot + 1).toLowerCase();
  const factory = EXTENSION_LANGUAGE[ext];
  return factory ? [factory()] : [];
}

/** Rough binary/unusual-extension sniff so the tree can show a distinct
 *  icon — not a correctness check (the server already refuses non-UTF-8
 *  content as `skipped`, see workspace.go), purely cosmetic. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"]);
export function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}
