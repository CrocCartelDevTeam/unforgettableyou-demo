"use strict";
const { getSession } = require("./_lib/auth");
const { buildFiles } = require("./_lib/publish-files");
const { commitFiles } = require("./_lib/github");

module.exports = async function (req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const s = getSession(req);
  if (!s) { res.status(401).json({ error: "Please sign in to publish." }); return; }

  const body = req.body || {};
  const built = buildFiles(body.text, body.photos);

  try {
    const sha = await commitFiles(built.files, "Site edit by " + s.u);
    res.status(200).json({ ok: true, commit: sha });
  } catch (e) {
    console.error("publish:", e && e.message);
    res.status(500).json({ error: e && e.message ? e.message : "Publish failed." });
  }
};
