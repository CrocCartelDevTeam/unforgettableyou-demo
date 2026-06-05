"use strict";
/* Atomic multi-file commit to a GitHub repo via the Git Data API.
   Server-side only — the token never reaches the browser. */

const REPO = process.env.UY_GH_REPO || "";          // "owner/name"
const BRANCH = process.env.UY_GH_BRANCH || "main";
const TOKEN = process.env.UY_GH_TOKEN || "";
const API = "https://api.github.com";

async function gh(path, opts) {
  const res = await fetch(API + path, Object.assign({}, opts, {
    headers: Object.assign({
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "unforgettableyou-editor",
      "Content-Type": "application/json",
    }, (opts && opts.headers) || {}),
  }));
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error("GitHub " + res.status + ": " + (json.message || text));
    err.status = res.status;
    throw err;
  }
  return json;
}

/**
 * Commit a set of files in a single commit.
 * @param {Array<{path:string, content:string, encoding?:("utf-8"|"base64")}>} files
 * @param {string} message
 * @returns {Promise<string>} new commit sha
 */
async function commitFiles(files, message) {
  if (!REPO || !TOKEN) throw new Error("Server not configured (UY_GH_REPO / UY_GH_TOKEN).");
  if (!files || !files.length) throw new Error("No files to commit.");

  const ref = await gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH);
  const latest = ref.object.sha;
  const baseCommit = await gh("/repos/" + REPO + "/git/commits/" + latest);
  const baseTree = baseCommit.tree.sha;

  const treeItems = [];
  for (const f of files) {
    const blob = await gh("/repos/" + REPO + "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: f.content, encoding: f.encoding || "utf-8" }),
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await gh("/repos/" + REPO + "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTree, tree: treeItems }),
  });
  const commit = await gh("/repos/" + REPO + "/git/commits", {
    method: "POST",
    body: JSON.stringify({ message: message, tree: tree.sha, parents: [latest] }),
  });
  await gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

module.exports = { commitFiles };
