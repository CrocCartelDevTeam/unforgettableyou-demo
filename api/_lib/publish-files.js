"use strict";
/* Pure helper: turn an edit payload into the list of files to commit.
   Kept separate from the network code so it can be unit-tested. */

function extFromMime(m) {
  return ({
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  })[m] || "jpg";
}

/**
 * @param {object} text   { en: {key: html}, he: {key: html} }
 * @param {object} photos { photoKey: dataURL | existingPath }
 * @param {number} now    timestamp (injectable for tests)
 * @returns {{files: Array, photoMap: object}}
 */
function buildFiles(text, photos, now) {
  now = now || Date.now();
  const files = [];
  files.push({
    path: "content/overrides.json",
    content: JSON.stringify(text || {}, null, 2),
    encoding: "utf-8",
  });

  const photoMap = {};
  const ph = photos || {};
  Object.keys(ph).forEach(function (key) {
    const val = ph[key];
    if (typeof val !== "string" || !val) return;
    const m = val.match(/^data:([^;]+);base64,(.*)$/);
    if (m) {
      const mime = m[1];
      const b64 = m[2];
      const path = "uploads/" + key + "-" + now + "." + extFromMime(mime);
      files.push({ path: path, content: b64, encoding: "base64" });
      photoMap[key] = path;
    } else {
      // Already a committed path from a previous publish — keep it (relative).
      photoMap[key] = val.replace(/^\//, "");
    }
  });

  files.push({
    path: "content/photos.json",
    content: JSON.stringify(photoMap, null, 2),
    encoding: "utf-8",
  });

  return { files: files, photoMap: photoMap };
}

module.exports = { buildFiles, extFromMime };
